"""账单费用：本月 MTD + 近 12 个月历史。带 5 分钟缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, query_cost_range, cached, cache_invalidate

import time
from datetime import date, datetime, time as dt_time

router = APIRouter(prefix="/billing", tags=["账单费用"])


def _cost_number(value):
    """把旧桌面版 AzureManager 返回的 mtd/acc/history 字符串转成数值；不可转时返回 None。"""
    try:
        if value is None:
            return None
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def _normalize_cost_data(cost_data: dict | None) -> dict:
    """兼容旧项目费用查询结构：{mtd, acc, history, currency}。"""
    cost_data = cost_data or {}
    mtd_raw = cost_data.get("mtd", cost_data.get("month_to_date"))
    acc_raw = cost_data.get("acc", cost_data.get("accumulated"))
    history_raw = cost_data.get("history")
    history_12m = cost_data.get("history_12m")
    if not isinstance(history_12m, list):
        history_12m = []
    return {
        "month_to_date": _cost_number(mtd_raw),
        "accumulated": _cost_number(acc_raw),
        "history_total": _cost_number(history_raw),
        "currency": cost_data.get("currency") or "USD",
        "status_text": str(mtd_raw) if _cost_number(mtd_raw) is None and mtd_raw is not None else "",
        "history_12m": history_12m,
    }


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
        normalized = _normalize_cost_data(cost_data)
        return {
            "account_id": account_id,
            "account_alias": acct.alias,
            **normalized,
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
        return _cached_billing(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取费用失败：{e}")


_range_cache = {}

@router.get("/range")
def billing_range(
    account_id: int = Query(...),
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    group_by: str = Query("none", description="none | resource_group"),
    cost_type: str = Query("actual", description="actual | amortized（预留）"),
    refresh: bool = Query(False),
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """按日期区间查询费用（对标 Azure 账单页面的查询费用）。"""
    try:
        today_str = str(date.today())
        key = f"{account_id}_{start}_{end}_{group_by}_{today_str}"
        
        if refresh and key in _range_cache:
            del _range_cache[key]
            
        now = time.time()
        
        if key in _range_cache and now < _range_cache[key]["expires_at"]:
            cached_item = _range_cache[key]
            res = dict(cached_item["data"])
            res["_cache"] = {
                "hit": True,
                "updated_at": datetime.fromtimestamp(cached_item["updated_at"]).strftime("%Y-%m-%d %H:%M:%S"),
                "expires_at": datetime.fromtimestamp(cached_item["expires_at"]).strftime("%Y-%m-%d %H:%M:%S"),
                "ttl_seconds": int((cached_item["expires_at"] - now) / 60)
            }
            return res

        res = call_with_timeout(
            lambda: query_cost_range(account_id, start, end, group_by),
            timeout=60,
            timeout_msg="账单查询超时",
        )
        
        if len(_range_cache) > 200:
            _range_cache.clear()
            
        end_of_day = datetime.combine(date.today(), dt_time(23, 59, 59))
        expires_at = end_of_day.timestamp()
        
        _range_cache[key] = {
            "data": res,
            "updated_at": now,
            "expires_at": expires_at
        }
        
        res = dict(res)
        res["_cache"] = {
            "hit": False,
            "updated_at": datetime.fromtimestamp(now).strftime("%Y-%m-%d %H:%M:%S"),
            "expires_at": datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d %H:%M:%S"),
            "ttl_seconds": int((expires_at - now) / 60)
        }
        return res
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
                normalized = _normalize_cost_data(cost_data)
                item["month_to_date"] = normalized["month_to_date"]
                item["currency"] = normalized["currency"]
                if normalized["status_text"]:
                    item["error"] = normalized["status_text"]
            else:
                item["error"] = str(_msg or "查询失败")
        except Exception as e:
            item["error"] = str(e)[:200]
        out.append(item)
    return out
