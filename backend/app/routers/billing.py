"""账单费用：本月 MTD + 近 12 个月历史。带 5 分钟缓存。"""
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, ResourceCache, User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, query_cost_range, cached, cache_invalidate

BILLING_RANGE_TTL_SECONDS = 20 * 60
BILLING_RANGE_MAX_DAYS = 93


def _utc_now():
    return datetime.utcnow().replace(microsecond=0)


def _dt_s(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value[:19], fmt)
        except ValueError:
            continue
    return None


def _parse_day(value: str, name: str) -> datetime:
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, f"{name} 必须是 YYYY-MM-DD 格式")


def _billing_cache_key(account_id: int, start: str, end: str, group_by: str, cost_type: str) -> str:
    # v2 includes unaggregated per-day detail_rows. Bump version to avoid serving older
    # cache entries whose details were already grouped into one row per resource group.
    return f"billing_range:v2:{account_id}:{start}:{end}:{group_by}:{cost_type}"


def _decorate_range_result(data: dict, *, cached_hit: bool, generated_at: datetime, expires_at: datetime,
                           stale: bool = False, warning: str = "") -> dict:
    out = dict(data or {})
    out.update({
        "cached": cached_hit,
        "stale": stale,
        "generated_at": _dt_s(generated_at),
        "expires_at": _dt_s(expires_at),
        "cache_ttl_seconds": int((expires_at - _utc_now()).total_seconds()),
        "source": "cache" if cached_hit else "azure",
    })
    if warning:
        out["warning"] = warning
    return out


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


@router.get("/range")
def billing_range(
    account_id: int = Query(...),
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    group_by: str = Query("none", description="none | resource_group"),
    cost_type: str = Query("actual", description="actual | amortized"),
    force_refresh: bool = Query(False, description="true 时绕过缓存，实时刷新 Azure Cost Management"),
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user),
):
    """按日期区间查询费用。

    优化点：默认优先返回 20 分钟内的本地持久化缓存，避免仪表盘重复查询时同步等待 Azure
    Cost Management；手动刷新时才绕过缓存。若 Azure 刷新失败但存在旧缓存，则返回旧数据并附带 warning。
    """
    group_by = (group_by or "none").strip().lower()
    cost_type = (cost_type or "actual").strip().lower()
    if group_by not in {"none", "resource_group"}:
        raise HTTPException(400, "当前仅支持按资源组分组或不分组")
    if cost_type not in {"actual", "amortized"}:
        raise HTTPException(400, "cost_type 仅支持 actual 或 amortized")

    start_dt = _parse_day(start, "start")
    end_dt = _parse_day(end, "end")
    if end_dt < start_dt:
        raise HTTPException(400, "结束日期不能早于开始日期")
    days = (end_dt - start_dt).days + 1
    if days > BILLING_RANGE_MAX_DAYS:
        raise HTTPException(400, f"账单查询区间最多支持 {BILLING_RANGE_MAX_DAYS} 天，请缩短日期范围")

    now = _utc_now()
    key = _billing_cache_key(account_id, start, end, group_by, cost_type)
    row = db.query(ResourceCache).filter_by(key=key).first()
    if row and row.data_json and not force_refresh:
        updated = _parse_dt(row.updated_at) or now
        expires = updated.replace(hour=23, minute=59, second=59)
        if now < expires:
            try:
                return _decorate_range_result(json.loads(row.data_json), cached_hit=True, generated_at=updated, expires_at=expires)
            except Exception:
                pass

    try:
        data = call_with_timeout(
            lambda: query_cost_range(account_id, start, end, group_by, cost_type),
            timeout=60,
            timeout_msg="账单查询超时",
        )
        data.update({
            "account_id": account_id,
            "start": start,
            "end": end,
            "group_by": group_by,
            "cost_type": cost_type,
        })
        generated = _utc_now()
        expires = generated.replace(hour=23, minute=59, second=59)
        if row is None:
            row = ResourceCache(key=key)
            db.add(row)
        row.data_json = json.dumps(data, ensure_ascii=False)
        row.updated_at = _dt_s(generated)
        row.refresh_started_at = None
        row.last_error = ""
        db.commit()
        return _decorate_range_result(
            data,
            cached_hit=False,
            generated_at=generated,
            expires_at=expires,
        )
    except Exception as e:
        err = str(e)
        if row is not None:
            row.last_error = err[:1000]
            db.commit()
            if row.data_json:
                updated = _parse_dt(row.updated_at) or now
                expires = updated.replace(hour=23, minute=59, second=59)
                try:
                    return _decorate_range_result(
                        json.loads(row.data_json),
                        cached_hit=True,
                        generated_at=updated,
                        expires_at=expires,
                        stale=True,
                        warning=f"Azure 实时刷新失败，已返回上次缓存数据：{err[:200]}",
                    )
                except Exception:
                    pass
        raise HTTPException(400, err)


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
