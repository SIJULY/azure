"""Azure 账号管理：增删改查 + 连接测试 + 批量刷新/导入。client_secret 加密存储，读取时永不返回明文。"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, Proxy, User
from .. import crypto
from ..azure_svc import test_connection
from ..operations import record_operation

router = APIRouter(prefix="/accounts", tags=["Azure 账号"])


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class AccountIn(BaseModel):
    alias: str
    tenant_id: str
    client_id: str
    client_secret: str = ""
    subscription_id: str
    proxy_id: int | None = None


class BatchImportIn(BaseModel):
    accounts: list[AccountIn]


class CredTestIn(BaseModel):
    tenant_id: str
    client_id: str
    client_secret: str
    proxy_id: int | None = None


@router.post("/test")
def test_credentials(data: CredTestIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """用原始凭据查询可访问的订阅列表（添加账号流程用，不保存）。"""
    from ..azure_svc import _connect_fast, proxy_env, call_with_timeout
    from ..vendor.azure_manager import AzureManager
    from azure.mgmt.subscription import SubscriptionClient

    if not all([data.tenant_id.strip(), data.client_id.strip(), data.client_secret.strip()]):
        raise HTTPException(400, "Tenant ID、Client ID、Client Secret 均不能为空")

    # 代理
    proxy = db.query(Proxy).filter_by(id=data.proxy_id).first() if data.proxy_id else None
    if not proxy:
        proxy = db.query(Proxy).filter_by(is_default=True).first()

    mgr = AzureManager()
    profile = {
        "tenant_id": data.tenant_id.strip(),
        "client_id": data.client_id.strip(),
        "client_secret": data.client_secret,
        "subscription_id": "00000000-0000-0000-0000-000000000000",  # 占位，查订阅列表不需要
    }
    try:
        # 用临时的 account 对象传代理
        class _Acct:
            proxy_id = proxy.id if proxy else None
        with proxy_env(_Acct()):
            _connect_fast(mgr, profile, alias="test")
            def _list_subs():
                sc = SubscriptionClient(mgr.credential)
                return [
                    {"subscription_id": s.subscription_id, "display_name": s.display_name or ""}
                    for s in sc.subscriptions.list()
                ]
            subs = call_with_timeout(_list_subs, timeout=30, timeout_msg="查询订阅超时")
        record_operation(db, "account_test_credentials", "测试 Azure 凭据", resource=data.client_id.strip(), operator=_u)
        return {"ok": True, "subscriptions": subs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"查询订阅失败：{e}")


def _to_out(a: AzureAccount, db: Session) -> dict:
    proxy_name = ""
    proxy_url = ""
    if a.proxy_id:
        p = db.query(Proxy).filter_by(id=a.proxy_id).first()
        if p:
            proxy_name = p.name
            # 构造代理 URL（不含密码）
            from ..azure_svc import _proxy_url_of
            try:
                proxy_url = _proxy_url_of(p)
                # 去掉密码部分
                if "@" in proxy_url:
                    scheme, rest = proxy_url.split("://", 1)
                    host = rest.split("@", 1)[1]
                    proxy_url = f"{scheme}://{host}"
            except Exception:
                pass
    return {
        "id": a.id,
        "alias": a.alias,
        "tenant_id": a.tenant_id,
        "subscription_id": a.subscription_id,
        "subscription_name": a.subscription_name or "",
        "country_code": a.country_code or "",
        "quota_tier": a.quota_tier or "",
        "status": a.status,
        "status_msg": a.status_msg or "",
        "proxy_id": a.proxy_id,
        "proxy_name": proxy_name,
        "proxy_url": proxy_url,
        "last_checked": a.last_checked or "",
        "created_at": a.created_at,
        "updated_at": a.updated_at,
    }


@router.get("")
def list_accounts(q: str = Query(""), status: str = Query("all"),
                  db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    query = db.query(AzureAccount).order_by(AzureAccount.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (AzureAccount.alias.like(like)) |
            (AzureAccount.subscription_id.like(like)) |
            (AzureAccount.tenant_id.like(like))
        )
    if status in ("healthy", "error"):
        query = query.filter_by(status=status)
    accounts = query.all()
    total = db.query(AzureAccount).count()
    return {"items": [_to_out(a, db) for a in accounts], "total": total}


def _do_test(a: AzureAccount, db: Session) -> dict:
    payload = {
        "alias": a.alias,
        "tenant_id": a.tenant_id,
        "client_id": a.client_id,
        "client_secret": crypto.decrypt(a.client_secret_enc),
        "subscription_id": a.subscription_id,
    }
    try:
        info = test_connection(payload)
    except Exception as e:
        a.status = "error"
        a.status_msg = str(e)[:500]
        a.last_checked = _now()
        db.commit()
        return {"ok": False, "error": str(e)}
    a.status = "healthy"
    a.status_msg = ""
    a.subscription_name = info.get("subscription_name", "")
    if info.get("country_code"):
        a.country_code = info["country_code"]
    if info.get("quota_tier"):
        a.quota_tier = info["quota_tier"]
    a.last_checked = _now()
    db.commit()
    return {"ok": True, **info}


@router.post("")
def create_account(data: AccountIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not data.client_secret:
        raise HTTPException(400, "client_secret 不能为空")
    # 先测试连接，通不过不入库
    try:
        info = test_connection(data.model_dump())
    except Exception as e:
        raise HTTPException(400, f"连接测试失败：{e}")
    a = AzureAccount(
        alias=data.alias,
        tenant_id=data.tenant_id.strip(),
        client_id=data.client_id.strip(),
        client_secret_enc=crypto.encrypt(data.client_secret),
        subscription_id=data.subscription_id.strip(),
        subscription_name=info.get("subscription_name", ""),
        country_code=info.get("country_code", ""),
        quota_tier=info.get("quota_tier", ""),
        status="healthy",
        proxy_id=data.proxy_id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    record_operation(db, "account_create", f"创建 Azure 账号 {a.alias}", resource=a.alias, account_id=a.id, operator=_u)
    return _to_out(a, db)


@router.put("/{account_id}")
def update_account(account_id: int, data: AccountIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    a = db.query(AzureAccount).filter_by(id=account_id).first()
    if not a:
        raise HTTPException(404, "账号不存在")
    payload = data.model_dump()
    if not payload["client_secret"]:
        # 未提供则沿用旧 secret
        payload["client_secret"] = crypto.decrypt(a.client_secret_enc)
    try:
        info = test_connection(payload)
    except Exception as e:
        raise HTTPException(400, f"连接测试失败：{e}")
    a.alias = data.alias
    a.tenant_id = data.tenant_id.strip()
    a.client_id = data.client_id.strip()
    a.client_secret_enc = crypto.encrypt(payload["client_secret"])
    a.subscription_id = data.subscription_id.strip()
    a.subscription_name = info.get("subscription_name", "")
    a.country_code = info.get("country_code", "") or a.country_code
    a.quota_tier = info.get("quota_tier", "")
    a.status = "healthy"
    a.status_msg = ""
    a.proxy_id = data.proxy_id
    db.commit()
    record_operation(db, "account_update", f"更新 Azure 账号 {a.alias}", resource=a.alias, account_id=a.id, operator=_u)
    return _to_out(a, db)


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    a = db.query(AzureAccount).filter_by(id=account_id).first()
    if not a:
        raise HTTPException(404, "账号不存在")
    alias = a.alias
    db.delete(a)
    db.commit()
    record_operation(db, "account_delete", f"删除 Azure 账号 {alias}", resource=alias, account_id=account_id, operator=_u)
    return {"ok": True}


@router.post("/{account_id}/test")
def test_account(account_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    a = db.query(AzureAccount).filter_by(id=account_id).first()
    if not a:
        raise HTTPException(404, "账号不存在")
    result = _do_test(a, db)
    if not result["ok"]:
        raise HTTPException(400, f"连接测试失败：{result['error']}")
    record_operation(db, "account_test", f"测试 Azure 账号 {a.alias}", resource=a.alias, account_id=a.id, operator=_u)
    return result


@router.post("/batch-refresh")
def batch_refresh(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """批量刷新全部账号状态。"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from ..db import SessionLocal
    
    accounts = db.query(AzureAccount).order_by(AzureAccount.id).all()
    account_ids = [a.id for a in accounts]
    
    def _test_by_id(aid: int):
        s = SessionLocal()
        try:
            a = s.query(AzureAccount).filter_by(id=aid).first()
            if not a:
                return None
            r = _do_test(a, s)
            return {"id": a.id, "alias": a.alias, **r}
        finally:
            s.close()
            
    results = []
    # 使用线程池并发检测，加快批量刷新速度
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_test_by_id, aid) for aid in account_ids]
        for f in as_completed(futures):
            res = f.result()
            if res:
                results.append(res)
                
    record_operation(db, "account_batch_refresh", f"批量刷新 {len(results)} 个 Azure 账号", resource="Azure 账号", operator=_u, detail={"count": len(results)})
    return results


@router.post("/batch-delete")
def batch_delete(ids: list[int], db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """批量删除账号。"""
    n = 0
    for i in ids:
        a = db.query(AzureAccount).filter_by(id=i).first()
        if a:
            db.delete(a)
            n += 1
    db.commit()
    record_operation(db, "account_batch_delete", f"批量删除 {n} 个 Azure 账号", resource="Azure 账号", operator=_u, detail={"ids": ids, "deleted": n})
    return {"ok": True, "deleted": n}


@router.post("/batch-import")
def batch_import(data: BatchImportIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """批量导入账号：逐个测试连接，通过的入库。"""
    results = []
    for item in data.accounts:
        if not item.client_secret:
            results.append({"alias": item.alias, "ok": False, "error": "client_secret 不能为空"})
            continue
        try:
            info = test_connection(item.model_dump())
        except Exception as e:
            results.append({"alias": item.alias, "ok": False, "error": str(e)[:200]})
            continue
        a = AzureAccount(
            alias=item.alias,
            tenant_id=item.tenant_id.strip(),
            client_id=item.client_id.strip(),
            client_secret_enc=crypto.encrypt(item.client_secret),
            subscription_id=item.subscription_id.strip(),
            subscription_name=info.get("subscription_name", ""),
            country_code=info.get("country_code", ""),
            quota_tier=info.get("quota_tier", ""),
            status="healthy",
            proxy_id=item.proxy_id,
            last_checked=_now(),
        )
        db.add(a)
        db.commit()
        results.append({"alias": item.alias, "ok": True, "id": a.id})
    ok_count = sum(1 for r in results if r.get("ok"))
    record_operation(db, "account_batch_import", f"批量导入 {ok_count} 个 Azure 账号", resource="Azure 账号", operator=_u, detail={"total": len(results), "ok": ok_count})
    return results
