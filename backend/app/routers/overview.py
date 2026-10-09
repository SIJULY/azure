"""总览：聚合各账号的资源计数与最近任务。所有 Azure 调用带超时，坏账号跳过。"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, Job, User
from ..azure_svc import get_manager, proxy_env, call_with_timeout
from .foundry import is_foundry_account

router = APIRouter(prefix="/overview", tags=["总览"])

# 总览缓存（15 秒），避免每次刷都查 Azure；refresh=true 可绕过缓存。
_overview_cache = {"data": None, "ts": 0}
_OVERVIEW_TTL = 15


@router.get("")
def overview(refresh: bool = Query(False), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    import time as _time
    now = _time.time()
    if not refresh and _overview_cache["data"] and (now - _overview_cache["ts"]) < _OVERVIEW_TTL:
        return _overview_cache["data"]

    accounts = db.query(AzureAccount).order_by(AzureAccount.id).all()
    healthy = sum(1 for a in accounts if a.status == "healthy")
    error = len(accounts) - healthy

    total_rg = 0
    vms_running = 0
    vms_stopped = 0
    foundry_total = 0
    foundry_resources_total = 0
    foundry_query_failed = False

    for a in [x for x in accounts if x.status == "healthy"]:
        try:
            mgr, _acct = get_manager(a.id, db)
        except Exception:
            continue
        with proxy_env(_acct):
            # 资源组（20 秒超时）
            try:
                rgs = call_with_timeout(
                    lambda: list(mgr.resource_client.resource_groups.list()),
                    timeout=20, timeout_msg="资源组查询超时")
                total_rg += len(rgs or [])
            except Exception:
                pass
            # 虚拟机状态计数（30 秒超时）
            try:
                def _count_vms():
                    running, stopped = 0, 0
                    for vm in mgr.compute_client.virtual_machines.list_all():
                        is_run = False
                        try:
                            vid = vm.id or ""
                            rg = vid.split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in vid else ""
                            if rg:
                                detail = mgr.compute_client.virtual_machines.get(rg, vm.name, expand="instanceView")
                                for st in (detail.instance_view.statuses or []):
                                    if "running" in (st.code or "").lower():
                                        is_run = True
                                        break
                        except Exception:
                            pass
                        if is_run:
                            running += 1
                        else:
                            stopped += 1
                    return running, stopped
                r, s = call_with_timeout(_count_vms, timeout=30, timeout_msg="VM 查询超时")
                vms_running += r
                vms_stopped += s
            except Exception:
                pass
            # Foundry（总览卡片按 Azure 账号数统计，而不是按资源数量统计。
            # 同一订阅下可能有多个 AIServices/OpenAI 资源，但用户语义上仍然是 1 个 Foundry 账号入口。）
            try:
                def _count_cs():
                    from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
                    cs = CognitiveServicesManagementClient(mgr.credential, mgr.subscription_id)
                    return len([x for x in cs.accounts.list() if is_foundry_account(x)])
                resource_count = call_with_timeout(_count_cs, timeout=20, timeout_msg="Foundry 查询超时")
                foundry_resources_total += resource_count
                if resource_count > 0:
                    foundry_total += 1
            except Exception:
                foundry_query_failed = True

    recent_jobs = db.query(Job).order_by(Job.created_at.desc()).limit(8).all()

    result = {
        "accounts": {"total": len(accounts), "healthy": healthy, "error": error},
        "resource_groups": {"total": total_rg},
        "vms": {"running": vms_running, "stopped": vms_stopped, "total": vms_running + vms_stopped},
        "foundry": {"total": foundry_total, "resources_total": foundry_resources_total, "partial": foundry_query_failed},
        "recent_jobs": [
            {"id": j.id, "type": j.type, "title": j.title, "account_id": j.account_id,
             "status": j.status, "created_at": j.created_at, "finished_at": j.finished_at}
            for j in recent_jobs
        ],
    }
    _overview_cache["data"] = result
    _overview_cache["ts"] = now
    return result
