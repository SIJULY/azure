"""Azure 服务层：封装 vendored AzureManager，提供按账号的客户端 + 代理支持。"""
import logging
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from contextlib import contextmanager
from sqlalchemy.orm import Session
from .db import SessionLocal, AzureAccount, ProxyConfig, Proxy
from . import crypto
from .vendor.azure_manager import AzureManager

log = logging.getLogger("azure_svc")

# Azure Cost Management 等慢接口的硬超时（秒），避免重试退避把请求 hang 住
SLOW_API_TIMEOUT = 50

# 通用 TTL 缓存：key -> (expire_ts, data)，用于 Azure 读接口
_cache = {}
import time as _time


def cached(ttl=90, validate=None):
    """装饰器：缓存函数返回值 ttl 秒。key 由函数名+参数生成。
    validate: 可选验证函数，返回 False 则不缓存（用于避免缓存空/失败结果）。"""
    def deco(fn):
        def wrapper(*args, **kwargs):
            key = (fn.__name__, str(args), str(sorted(kwargs.items())))
            now = _time.time()
            if key in _cache:
                exp, data = _cache[key]
                if now < exp:
                    return data
            data = fn(*args, **kwargs)
            # 验证通过才缓存
            if validate is None or validate(data):
                _cache[key] = (now + ttl, data)
                # 防止内存无限增长
                if len(_cache) > 500:
                    _cache.clear()
            return data
        return wrapper
    return deco


def cache_invalidate(prefix=""):
    """清除缓存（写操作后调用）。prefix 为空则全清。"""
    if not prefix:
        _cache.clear()
    else:
        for k in [k for k in _cache if k[0].startswith(prefix)]:
            _cache.pop(k, None)


def call_with_timeout(fn, timeout=SLOW_API_TIMEOUT, timeout_msg="Azure 接口响应超时"):
    """在独立线程中执行 fn，超时则抛 RuntimeError（不修改 vendored 代码的前提下限时）。
    注意：不用 with 语句，避免退出时 shutdown(wait=True) 被 hang 住的线程拖住。"""
    pool = ThreadPoolExecutor(max_workers=1)
    try:
        fut = pool.submit(fn)
        try:
            return fut.result(timeout=timeout)
        except FuturesTimeout:
            raise RuntimeError(f"{timeout_msg}（{timeout} 秒），请稍后重试或检查代理/网络")
    finally:
        # 不等待 hang 住的线程，直接丢弃
        pool.shutdown(wait=False, cancel_futures=True)


@contextmanager
def proxy_env(account: AzureAccount | None = None):
    """按代理配置临时设置环境变量代理（azure SDK 与 requests 均遵守）。
    优先级：账号绑定的代理 > 默认全局代理 > 不使用代理。"""
    s = SessionLocal()
    old = {}
    try:
        proxy = None
        if account is not None and getattr(account, "proxy_id", None):
            proxy = s.query(Proxy).filter_by(id=account.proxy_id).first()
        if proxy is None:
            proxy = s.query(Proxy).filter_by(is_default=True).first()
        if proxy and proxy.host and proxy.port:
            auth = ""
            if proxy.username:
                pw = crypto.decrypt(proxy.password_enc) if proxy.password_enc else ""
                auth = f"{proxy.username}:{pw}@" if pw else f"{proxy.username}@"
            scheme = "socks5h" if proxy.protocol == "socks5" else "http"
            url = f"{scheme}://{auth}{proxy.host}:{proxy.port}"
            for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
                old[k] = os.environ.get(k)
                os.environ[k] = url
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        s.close()


def _proxy_url_of(proxy: Proxy) -> str:
    auth = ""
    if proxy.username:
        pw = crypto.decrypt(proxy.password_enc) if proxy.password_enc else ""
        auth = f"{proxy.username}:{pw}@" if pw else f"{proxy.username}@"
    scheme = "socks5h" if proxy.protocol == "socks5" else "http"
    return f"{scheme}://{auth}{proxy.host}:{proxy.port}"


def query_cost_range(account_id: int, start: str, end: str, group_by: str = "none") -> dict:
    """按日期区间查询费用（日粒度），支持按资源组分组。"""
    import requests as _requests
    from .db import SessionLocal as _SL

    s = _SL()
    try:
        acct = s.query(AzureAccount).filter_by(id=account_id).first()
        if not acct:
            raise ValueError("账号不存在")
        profile = _profile_of(acct)
        proxy = None
        if getattr(acct, "proxy_id", None):
            proxy = s.query(Proxy).filter_by(id=acct.proxy_id).first()
        if proxy is None:
            proxy = s.query(Proxy).filter_by(is_default=True).first()
        proxies = {"http": _proxy_url_of(proxy), "https": _proxy_url_of(proxy)} if proxy and proxy.host else None
    finally:
        s.close()

    from .vendor.azure_manager import ClientSecretCredential
    cred = ClientSecretCredential(
        tenant_id=profile["tenant_id"],
        client_id=profile["client_id"],
        client_secret=profile["client_secret"],
    )
    token = cred.get_token("https://management.azure.com/.default").token
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    url = (
        f"https://management.azure.com/subscriptions/{profile['subscription_id']}"
        f"/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
    )
    dataset: dict = {
        "granularity": "Daily",
        "aggregation": {"totalCost": {"name": "PreTaxCost", "function": "Sum"}},
    }
    if group_by == "resource_group":
        dataset["grouping"] = [{"type": "Dimension", "name": "ResourceGroupName"}]
    payload = {
        "type": "Usage",
        "timeframe": "Custom",
        "timePeriod": {"from": start, "to": end},
        "dataset": dataset,
    }

    def _do():
        resp = _requests.post(url, headers=headers, json=payload, timeout=20, proxies=proxies)
        if resp.status_code == 429 or resp.status_code >= 500:
            raise RuntimeError(f"Azure Cost Management 返回 {resp.status_code}，请稍后重试")
        if resp.status_code != 200:
            raise RuntimeError(f"费用查询失败：{resp.status_code} {resp.text[:200]}")
        return resp.json()

    data = call_with_timeout(_do, timeout_msg="账单查询超时")
    props = data.get("properties", {})
    columns = [c.get("name") for c in props.get("columns", [])]
    rows = props.get("rows", [])

    def _col(name):
        try:
            return columns.index(name)
        except ValueError:
            return -1

    i_cost, i_curr, i_date, i_rg = _col("PreTaxCost"), _col("Currency"), _col("UsageDate"), _col("ResourceGroupName")
    total = 0.0
    currency = ""
    daily: dict = {}
    details: dict = {}
    for r in rows:
        try:
            cost = float(r[i_cost]) if i_cost >= 0 else 0.0
        except (ValueError, TypeError, IndexError):
            cost = 0.0
        total += cost
        if i_curr >= 0 and not currency:
            currency = str(r[i_curr])
        date_s = str(r[i_date])[:10] if i_date >= 0 else ""
        rg = str(r[i_rg]) if i_rg >= 0 and r[i_rg] else ""
        if date_s:
            daily[date_s] = daily.get(date_s, 0.0) + cost
        if rg:
            details[rg] = details.get(rg, 0.0) + cost

    return {
        "total": round(total, 2),
        "currency": currency or "USD",
        "daily": [{"date": d, "cost": round(c, 2)} for d, c in sorted(daily.items())],
        "details": [{"resource_group": k, "cost": round(v, 2)} for k, v in sorted(details.items(), key=lambda x: -x[1])],
    }


def _profile_of(acct: AzureAccount) -> dict:
    return {
        "tenant_id": acct.tenant_id,
        "client_id": acct.client_id,
        "client_secret": crypto.decrypt(acct.client_secret_enc),
        "subscription_id": acct.subscription_id,
    }


def _connect_fast(mgr: AzureManager, profile: dict, alias: str):
    """轻量连接：只建 credential 和 clients，不做 provider 注册/订阅名/配额层级/VM 拉取。
    读接口用，速度快；写操作（创建 VM 等）仍用完整 connect。"""
    from .vendor.azure_manager import ClientSecretCredential
    from azure.mgmt.compute import ComputeManagementClient
    from azure.mgmt.network import NetworkManagementClient
    from azure.mgmt.resource.resources import ResourceManagementClient

    mgr.tenant_id = profile.get("tenant_id")
    mgr.client_id = profile.get("client_id")
    mgr.client_secret = profile.get("client_secret")
    mgr.subscription_id = profile.get("subscription_id")
    if not all([mgr.tenant_id, mgr.client_id, mgr.client_secret, mgr.subscription_id]):
        raise ValueError("凭据不完整")
    mgr.credential = ClientSecretCredential(
        tenant_id=mgr.tenant_id, client_id=mgr.client_id, client_secret=mgr.client_secret
    )
    mgr.compute_client = ComputeManagementClient(mgr.credential, mgr.subscription_id)
    mgr.network_client = NetworkManagementClient(mgr.credential, mgr.subscription_id)
    mgr.resource_client = ResourceManagementClient(mgr.credential, mgr.subscription_id)
    mgr.connected_alias = alias
    # 预取 token 验证凭据有效性（15 秒超时，坏凭据直接抛错不 hang）
    def _get_token():
        return mgr.credential.get_token("https://management.azure.com/.default")
    try:
        call_with_timeout(_get_token, timeout=15, timeout_msg="获取 Azure token 超时")
    except Exception as e:
        raise RuntimeError(f"Azure 认证失败：{e}")


def get_manager(account_id: int, db: Session | None = None, full: bool = False) -> tuple[AzureManager, AzureAccount]:
    """连接指定账号并返回 (manager, account)。失败抛异常（中文信息）。
    full=False（默认）：轻量连接，读接口用；full=True：完整 connect，写操作用。"""
    own = False
    if db is None:
        db = SessionLocal()
        own = True
    try:
        acct = db.query(AzureAccount).filter_by(id=account_id).first()
        if not acct:
            raise ValueError("账号不存在")
        mgr = AzureManager()
        with proxy_env(acct):
            if full:
                mgr.connect(_profile_of(acct), alias=acct.alias or f"account-{acct.id}")
            else:
                _connect_fast(mgr, _profile_of(acct), alias=acct.alias or f"account-{acct.id}")
        return mgr, acct
    except Exception as e:
        msg = str(e)
        raise RuntimeError(f"连接 Azure 失败：{msg}")
    finally:
        if own:
            db.close()


def test_connection(data: dict) -> dict:
    """轻量连接测试：只验证服务主体凭据有效 + 订阅可读，不做 provider 注册与 VM 全量拉取。"""
    import requests as _requests
    from .vendor.azure_manager import ClientSecretCredential

    tenant_id = data["tenant_id"].strip()
    client_id = data["client_id"].strip()
    client_secret = data["client_secret"]
    subscription_id = data["subscription_id"].strip()
    if not all([tenant_id, client_id, client_secret, subscription_id]):
        raise ValueError("凭据不完整")
    try:
        cred = ClientSecretCredential(
            tenant_id=tenant_id, client_id=client_id, client_secret=client_secret
        )
        with proxy_env():
            access_token = cred.get_token("https://management.azure.com/.default").token
            # 一次轻量 ARM 调用：读订阅信息
            resp = _requests.get(
                f"https://management.azure.com/subscriptions/{subscription_id}?api-version=2020-01-01",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
    except Exception as e:
        raise RuntimeError(f"认证失败：{e}")
    if resp.status_code == 401 or resp.status_code == 403:
        raise RuntimeError("认证被拒：请检查 tenant/client_id/client_secret 是否正确")
    if resp.status_code == 404:
        raise RuntimeError("订阅不存在：请检查 subscription_id")
    if resp.status_code != 200:
        raise RuntimeError(f"Azure 返回 {resp.status_code}：{resp.text[:200]}")
    sub_name = ""
    try:
        sub_name = resp.json().get("displayName", "")
    except Exception:
        pass
    return {"ok": True, "subscription_name": sub_name, "quota_tier": ""}
