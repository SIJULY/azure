"""资源配额：Compute 配额 + Foundry 模型配额。带 90 秒缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached, cache_invalidate

router = APIRouter(prefix="/quotas", tags=["资源配额"])


def _do_fetch_quotas(account_id: int, db: Session) -> dict:
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    
    from datetime import datetime, timedelta
    
    upgrade_available = "不可用"
    next_tier_date = "-"
    upgrade_policy = "自动升级"
    
    try:
        from .foundry import _cached_foundry_resources
        resources = _cached_foundry_resources(account_id)
        earliest_dt = None
        for r in resources:
            cat = r.get("created_at")
            if cat:
                # "2024-05-01T10:00:00+00:00" etc, parse up to 19 chars
                try:
                    dt = datetime.fromisoformat(cat.split(".")[0][:19])
                    if earliest_dt is None or dt < earliest_dt:
                        earliest_dt = dt
                except Exception:
                    pass
        
        if earliest_dt:
            # You can change the threshold here, e.g. 30 days
            N_DAYS = 30
            days_passed = (datetime.now() - earliest_dt).days
            if days_passed >= N_DAYS:
                upgrade_available = "可升级"
                next_tier_date = "-"
            else:
                upgrade_available = "不可用"
                next_tier_date = (earliest_dt + timedelta(days=N_DAYS)).strftime("%Y-%m-%d")
        else:
            upgrade_available = "未开启 Foundry"
            next_tier_date = "-"
    except Exception:
        pass

    result = {
        "account_id": account_id,
        "account_alias": acct.alias,
        "quota_tier": "",
        "vm_quotas": [],
        "error": "",
        "upgrade_available": upgrade_available,
        "next_tier_available_at": next_tier_date,
        "upgrade_policy": upgrade_policy
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
                    
                    # Override calculated upgrade status with API truth if available
                    if tier_data.get("upgrade_available"):
                        status = tier_data.get("upgrade_available")
                        if status == "Eligible":
                            result["upgrade_available"] = "可升级"
                            result["next_tier_available_at"] = "-"
                        elif status == "Ineligible":
                            result["upgrade_available"] = "不可用"
                            app_date = tier_data.get("upgrade_applicable_date")
                            if app_date:
                                try:
                                    dt = datetime.fromisoformat(app_date.replace("Z", "+00:00").split(".")[0][:19])
                                    result["next_tier_available_at"] = dt.strftime("%Y-%m-%d")
                                except Exception:
                                    pass
                            reason = tier_data.get("upgrade_unavailability_reason")
                            if reason:
                                result["upgrade_policy"] = str(reason)
                        else:
                            result["upgrade_available"] = str(status)
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
