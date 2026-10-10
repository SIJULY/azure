"""资源配额：Compute 配额 + Foundry 模型配额。带 90 秒缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached, cache_invalidate

router = APIRouter(prefix="/quotas", tags=["资源配额"])


def _fmt_ymd(iso: str) -> str:
    """把 ISO 时间转成 YYYY-MM-DD，失败返回 '-'。"""
    dt = _parse_ymd(iso)
    return dt.strftime("%Y-%m-%d") if dt else "-"


def _cn_upgrade_status(status: str, reason: str = "") -> str:
    """升级可用状态中文化。status: Eligible / Ineligible。"""
    s = (status or "").strip().lower()
    reason = (reason or "").strip()
    if s == "eligible":
        return "可升级"
    if s == "ineligible":
        return f"不可用（{reason}）" if reason else "不可用"
    return status or "未知"


def _cn_upgrade_policy(policy: str) -> str:
    """升级策略中文化。"""
    p = (policy or "").strip().lower()
    if "noautoupgrade" in p:
        return "不自动升级"
    if "onceupgradeisavailable" in p:
        return "自动升级"
    return policy or "自动升级"


def _parse_ymd(iso: str):
    """把 ISO 时间解析成 datetime，失败返回 None。"""
    from datetime import datetime
    iso = (iso or "").strip()
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00").split(".")[0][:19])
    except Exception:
        return None


def _do_fetch_quotas(account_id: int, db: Session) -> dict:
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))

    result = {
        "account_id": account_id,
        "account_alias": acct.alias,
        "quota_tier": "",
        "vm_quotas": [],
        "error": "",
        # 升级相关列：以 Quota Tiers API 真实数据为准，无数据时显示 "-"
        # （与参照站一致，不做日期估算）
        "upgrade_available": "-",
        "next_tier_available_at": "-",
        "upgrade_policy": "自动升级",
    }
    try:
        with proxy_env(acct):
            try:
                ok, tier_data, _msg = call_with_timeout(
                    lambda: mgr.get_quota_tier(mgr.credential, mgr.subscription_id),
                    timeout=20, timeout_msg="配额层级查询超时",
                )
                if ok and tier_data:
                    result["quota_tier"] = tier_data.get("quota_tier", "")
                    result["cognitiveservices"] = tier_data

                    # 用 Quota Tiers API 的真实升级资格填充；
                    # API 未返回时保持 "-"（与参照站一致，不做估算）
                    api_status = (tier_data.get("upgrade_available") or "").strip()
                    if api_status:
                        result["upgrade_available"] = _cn_upgrade_status(
                            api_status, tier_data.get("upgrade_unavailability_reason", "")
                        )
                        result["next_tier_available_at"] = _fmt_ymd(
                            tier_data.get("upgrade_applicable_date", "")
                        )
                    policy = (tier_data.get("tier_upgrade_policy") or "").strip()
                    if policy:
                        result["upgrade_policy"] = _cn_upgrade_policy(policy)
                    nxt = (tier_data.get("next_tier_name") or "").strip()
                    if nxt:
                        result["next_tier_name"] = nxt
            except Exception:
                pass
            # 各区域计算配额（只查 4 个常用区域，避免触发限流）
            try:
                raw_regions = mgr.get_regions() or []
            except Exception:
                raw_regions = []
            # get_regions() 返回 "东亚 (香港) (eastasia)" 格式，需提取纯 code
            import re as _re
            regions = []
            for r in raw_regions[:4]:
                m = _re.search(r'\(([^)]+)\)$', r)
                code = m.group(1).lower() if m else r.lower()
                # 确保是纯英文字母的 region code
                if _re.match(r'^[a-z0-9]+$', code):
                    regions.append(code)
            for region in regions:
                try:
                    usages = call_with_timeout(
                        lambda r=region: list(mgr.compute_client.usage.list(r)),
                        timeout=15, timeout_msg="区域配额查询超时",
                    )
                    result["vm_quotas"].append({
                        "region": region,
                        "usages": [
                            {"name": u.name.value if u.name else "", "current": u.current_value, "limit": u.limit}
                            for u in usages
                            if u.name and u.name.value
                        ],
                    })
                except Exception:
                    continue
    except Exception as e:
        result["error"] = str(e)[:300]
    return result


@cached(ttl=600, validate=lambda d: bool(d.get("quota_tier")) and len(d.get("vm_quotas", [])) > 0)
def _cached_quotas(account_id: int) -> dict:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        return _do_fetch_quotas(account_id, db)
    finally:
        db.close()


@router.get("")
def quotas(account_id: int = Query(...), refresh: bool = False, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        if refresh:
            cache_invalidate("_cached_quotas")
        return _cached_quotas(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))
