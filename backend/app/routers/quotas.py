"""资源配额：Compute 配额 + Foundry 模型配额。带 90 秒缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached

router = APIRouter(prefix="/quotas", tags=["资源配额"])


def _do_fetch_quotas(account_id: int, db: Session) -> dict:
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    result = {"account_id": account_id, "account_alias": acct.alias, "quota_tier": "", "vm_quotas": [], "error": ""}
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
            except Exception:
                pass
            # 各区域计算配额（只查 4 个常用区域，避免触发限流）
            try:
                regions = (mgr.get_regions() or [])[:4]
            except Exception:
                regions = []
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
                            if u.name and "virtualmachines" in (u.name.value or "").lower()
                        ],
                    })
                except Exception:
                    continue
    except Exception as e:
        result["error"] = str(e)[:300]
    return result


@cached(ttl=90)
def _cached_quotas(account_id: int) -> dict:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        return _do_fetch_quotas(account_id, db)
    finally:
        db.close()


@router.get("")
def quotas(account_id: int = Query(...), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        return _cached_quotas(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))
