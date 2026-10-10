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


def _heuristic_upgrade(has_foundry: bool, assignment_date: str) -> tuple:
    """API 未返回升级资格时的启发式估算。

    依据：当前层级的分配日期。分配满 30 天即视为可能符合升级条件。
    （阈值 N_DAYS 可调）
    """
    from datetime import datetime, timedelta
    if not has_foundry:
        return "未开启 Foundry", "-"
    assign_dt = _parse_ymd(assignment_date)
    if not assign_dt:
        return "不可用", "-"
    N_DAYS = 30
    days_passed = (datetime.now() - assign_dt).days
    if days_passed >= N_DAYS:
        return "可升级", "-"
    return "不可用", (assign_dt + timedelta(days=N_DAYS)).strftime("%Y-%m-%d")


def _do_fetch_quotas(account_id: int, db: Session) -> dict:
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))

    # 是否开通过 Foundry 资源（AI Services / OpenAI kind）
    try:
        from .foundry import _cached_foundry_resources
        has_foundry = len(_cached_foundry_resources(account_id) or []) > 0
    except Exception:
        has_foundry = False

    result = {
        "account_id": account_id,
        "account_alias": acct.alias,
        "quota_tier": "",
        "vm_quotas": [],
        "error": "",
        "upgrade_available": "不可用",
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

                    # 用 Quota Tiers API 的真实升级资格覆盖启发式估算；
                    # API 未返回资格信息时，用层级分配日期做启发式估算
                    api_status = (tier_data.get("upgrade_available") or "").strip()
                    if api_status:
                        result["upgrade_available"] = _cn_upgrade_status(
                            api_status, tier_data.get("upgrade_unavailability_reason", "")
                        )
                        result["next_tier_available_at"] = _fmt_ymd(
                            tier_data.get("upgrade_applicable_date", "")
                        )
                    else:
                        ua, nd = _heuristic_upgrade(has_foundry, tier_data.get("assignment_date", ""))
                        result["upgrade_available"] = ua
                        result["next_tier_available_at"] = nd
                    policy = (tier_data.get("tier_upgrade_policy") or "").strip()
                    if policy:
                        result["upgrade_policy"] = _cn_upgrade_policy(policy)
                    nxt = (tier_data.get("next_tier_name") or "").strip()
                    if nxt:
                        result["next_tier_name"] = nxt
                else:
                    # tier API 无数据：仅用启发式
                    ua, nd = _heuristic_upgrade(has_foundry, "")
                    result["upgrade_available"] = ua
                    result["next_tier_available_at"] = nd
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
