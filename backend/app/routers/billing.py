"""账单费用：本月 MTD + 近 12 个月历史。带 5 分钟缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, query_cost_range, cached, cache_invalidate

router = APIRouter(prefix="/billing", tags=["账单费用"])


def _do_billing(account_id: int) -> dict:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        db.close()
        raise RuntimeError(str(e))
    try:
        with proxy_env(acct):
            ok, cost_data, _msg = call_with_timeout(
                lambda: mgr.get_month_to_date_cost(),
                timeout=25, timeout_msg="账单查询超时",
            )
        if not ok:
            raise RuntimeError(f"获取费用失败：{_msg}")
        return {
            "account_id": account_id,
            "account_alias": acct.alias,
            "month_to_date": cost_data.get("month_to_date"),
            "currency": cost_data.get("currency", "USD"),
            "history_12m": cost_data.get("history") or cost_data.get("history_12m") or [],
            "raw": cost_data,
        }
    finally:
        db.close()


@cached(ttl=600)
def _cached_billing(account_id: int) -> dict:
    return _do_billing(account_id)


@router.get("")
def billing(account_id: int = Query(...), refresh: bool = False, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        if refresh:
            cache_invalidate("_cached_billing")
        if refresh:
            cache_invalidate("_cached_billing")
        return _cached_billing(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取费用失败：{e}")


@router.get("/range")
def billing_range(
    account_id: int = Query(...),
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    group_by: str = Query("none", description="none | resource_group"),
    cost_type: str = Query("actual", description="actual | amortized（预留）"),
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """按日期区间查询费用（对标 AzureIn 账单页面的查询费用）。"""
    try:
        return query_cost_range(account_id, start, end, group_by)
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/summary")
def billing_summary(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    accounts = db.query(AzureAccount).order_by(AzureAccount.id).all()
    out = []
    for a in accounts:
        item = {"account_id": a.id, "alias": a.alias, "month_to_date": None, "currency": "USD", "error": ""}
        try:
            mgr, _acct = get_manager(a.id, db)
            with proxy_env(_acct):
                ok, cost_data, _msg = call_with_timeout(
                    lambda m=mgr: m.get_month_to_date_cost(),
                    timeout_msg="账单查询超时",
                )
            if ok and cost_data:
                item["month_to_date"] = cost_data.get("month_to_date")
                item["currency"] = cost_data.get("currency", "USD")
            else:
                item["error"] = str(_msg or "查询失败")
        except Exception as e:
            item["error"] = str(e)[:200]
        out.append(item)
    return out
