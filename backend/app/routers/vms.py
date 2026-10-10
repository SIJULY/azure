"""虚拟机：列表 / 创建表单元数据 / 创建（异步）/ 开关机等动作（异步）/ 详情。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User, AzureAccount
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached, cache_invalidate
from ..jobs import create_job, run_in_background
from ..operations import record_operation
from ..vendor.azure_manager import AZURE_REGIONS_CN

router = APIRouter(prefix="/vms", tags=["虚拟机"])


def _resource_group_from_id(resource_id: str) -> str:
    rid = resource_id or ""
    return rid.split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in rid else ""


def _name_from_id(resource_id: str) -> str:
    return (resource_id or "").rstrip("/").split("/")[-1]


def _power_state_from_statuses(statuses) -> str:
    for st in statuses or []:
        code = (getattr(st, "code", "") or "").lower()
        if code.startswith("powerstate/"):
            return code.split("/", 1)[1]
    return ""


def _do_list_vms(account_id: int) -> dict:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        db.close()
        raise RuntimeError(str(e))
    try:
        with proxy_env(acct):
            out = []
            try:
                vms = call_with_timeout(
                    lambda: list(mgr.compute_client.virtual_machines.list_all()),
                    timeout=20, timeout_msg="VM 列表查询超时")
            except Exception as e:
                raise RuntimeError(str(e))
            for vm in vms:
                vid = vm.id or ""
                rg = _resource_group_from_id(vid)
                status = "unknown"
                if rg:
                    try:
                        detail = call_with_timeout(
                            lambda: mgr.compute_client.virtual_machines.get(rg, vm.name, expand="instanceView"),
                            timeout=15, timeout_msg="VM 状态查询超时")
                        status = _power_state_from_statuses(getattr(getattr(detail, "instance_view", None), "statuses", [])) or status
                    except Exception:
                        try:
                            iv = call_with_timeout(
                                lambda: mgr.compute_client.virtual_machines.instance_view(rg, vm.name),
                                timeout=15, timeout_msg="VM 状态查询超时")
                            status = _power_state_from_statuses(getattr(iv, "statuses", [])) or status
                        except Exception:
                            pass
                public_ip = ""
                private_ip = ""
                ip_allocation_method = ""
                try:
                    def _get_ip():
                        nics = (vm.network_profile.network_interfaces or []) if vm.network_profile else []
                        first_private_ip = ""
                        first_allocation = ""
                        for nic_ref in nics:
                            nic_id = getattr(nic_ref, "id", "") or ""
                            nic_rg = _resource_group_from_id(nic_id) or rg
                            nic_name = _name_from_id(nic_id)
                            if not nic_rg or not nic_name:
                                continue
                            nic = mgr.network_client.network_interfaces.get(nic_rg, nic_name)
                            for cfg in (getattr(nic, "ip_configurations", None) or []):
                                if not first_private_ip:
                                    first_private_ip = getattr(cfg, "private_ip_address", "") or ""
                                pub = getattr(cfg, "public_ip_address", None)
                                pub_id = getattr(pub, "id", "") if pub else ""
                                if not pub_id:
                                    continue
                                pip_rg = _resource_group_from_id(pub_id) or nic_rg
                                pip_name = _name_from_id(pub_id)
                                if not pip_rg or not pip_name:
                                    continue
                                pip = mgr.network_client.public_ip_addresses.get(pip_rg, pip_name)
                                if not first_allocation:
                                    first_allocation = getattr(pip, "public_ip_allocation_method", "") or ""
                                ip = getattr(pip, "ip_address", "") or ""
                                if ip:
                                    return ip, first_private_ip, first_allocation
                        return "", first_private_ip, first_allocation
                    public_ip, private_ip, ip_allocation_method = call_with_timeout(
                        _get_ip, timeout=20, timeout_msg="公网 IP 查询超时")
                except Exception:
                    pass
                out.append({
                    "id": vid, "name": vm.name, "location": vm.location,
                    "vm_size": (vm.hardware_profile.vm_size if vm.hardware_profile else ""),
                    "status": status, "resource_group": rg, "public_ip": public_ip,
                    "private_ip": private_ip, "ip_allocation_method": ip_allocation_method,
                    "disk_size": "", "time_created": getattr(vm, "time_created", "") or "",
                })
            return {"vms": out, "_fetch_ok": True}
    finally:
        db.close()


@cached(ttl=600, validate=lambda d: d.get("_fetch_ok", False))
def _cached_vms(account_id: int) -> dict:
    return _do_list_vms(account_id)


class VmCreateIn(BaseModel):
    account_id: int
    region: str
    vm_size: str
    resource_group: str = ""
    os_image: str = ""
    os_image_data: dict | None = None
    disk_size_gb: int = 64
    disk_type: str = "Premium_LRS"
    ip_type: str = "Static"
    vm_name: str = ""
    username: str = ""
    password: str = ""
    ssh_key: str = ""
    user_data: str = ""
    dd_system: bool = False


class VmActionIn(BaseModel):
    account_id: int
    resource_group: str
    vm_name: str
    action: str  # start | stop | restart | delete | change_ip


@router.get("")
def list_vms(account_id: int, refresh: bool = False, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        if refresh:
            cache_invalidate("_cached_vms")
        return _cached_vms(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取虚拟机列表失败：{e}")


def _do_vm_meta(account_id: int, region: str) -> dict:
    """区域/规格：优先从 DB 读（持久化不变数据）；DB 为空时从 Azure 拉取并保存。"""
    import json as _json
    import re as _re
    from ..azure_svc import SessionLocal, get_manager, proxy_env, call_with_timeout
    from ..db import AzureAccount
    db = SessionLocal()
    try:
        acct = db.query(AzureAccount).filter_by(id=account_id).first()
        if not acct:
            raise RuntimeError("账号不存在")
        out = {
            "regions": [],
            "vm_sizes": [],
            "os_images": [],
            "ip_permission": "",
            "_fetch_ok": True,
        }
        # 区域：先读 DB，为空则从 Azure 拉取并保存
        try:
            regions = _json.loads(acct.supported_regions) if acct.supported_regions else []
        except Exception:
            regions = []
        if not regions:
            try:
                mgr, _a = get_manager(account_id, db)
                with proxy_env(_a):
                    regions = call_with_timeout(
                        lambda: mgr.get_regions(),
                        timeout=45, timeout_msg="区域查询超时")
                if regions:
                    acct.supported_regions = _json.dumps(regions, ensure_ascii=False)
                    db.commit()
            except Exception:
                regions = []  # 超时不抛 500，返回空
        if not regions and not acct.supported_regions:
            # DB 和 API 都没有，返回空（前端显示提示）
            pass
        for r in regions:
            m = _re.search(r'\(([^)]+)\)$', r)
            code = m.group(1).lower() if m else r.lower()
            out["regions"].append({"code": code, "name_cn": AZURE_REGIONS_CN.get(code, r)})
        # 规格：先读 DB，为空则从 Azure 拉取并保存（超时不抛错，返回空让前端转手动输入）
        if region:
            try:
                sizes_map = _json.loads(acct.region_vm_sizes) if acct.region_vm_sizes else {}
            except Exception:
                sizes_map = {}
            sizes = sizes_map.get(region, [])
            if not sizes:
                try:
                    mgr, _a = get_manager(account_id, db)
                    with proxy_env(_a):
                        sizes = call_with_timeout(
                            lambda: mgr.get_supported_vm_sizes(region),
                            timeout=45, timeout_msg="规格查询超时") or []
                    if sizes:
                        sizes_map[region] = sizes
                        acct.region_vm_sizes = _json.dumps(sizes_map, ensure_ascii=False)
                        db.commit()
                except Exception:
                    sizes = []  # 超时/失败不抛 500，前端显示手动输入
            out["vm_sizes"] = sizes
        return out
    finally:
        db.close()


@cached(ttl=600, validate=lambda d: d.get("_fetch_ok", False))
def _cached_vm_meta(account_id: int, region: str) -> dict:
    return _do_vm_meta(account_id, region)


@router.get("/meta")
def vm_meta(
    account_id: int,
    region: str = "",
    refresh: bool = False,
    db: Session = Depends(get_db),
    _u: User = Depends(get_current_user)
):
    try:
        if refresh:
            cache_invalidate("_cached_vm_meta")
        return _cached_vm_meta(account_id, region)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


def _do_create_vm(logger, account_id: int, payload: dict):
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        mgr, acct = get_manager(account_id, db, full=True)
        with proxy_env(acct):
            result = mgr.create_vm(payload, wait=True, log_callback=logger)
        return {"ok": True, "data": result}
    finally:
        db.close()


@router.post("")
def create_vm(data: VmCreateIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    acct = db.query(AzureAccount).filter_by(id=data.account_id).first()
    if not acct:
        raise HTTPException(404, "账号不存在")
    payload = data.model_dump()
    payload.pop("account_id")
    payload["custom_username"] = payload.get("username") or ""
    payload["custom_password"] = payload.get("password") or ""
    job_id = create_job("create_vm", f"创建虚拟机 ({data.region} / {data.vm_size})", data.account_id)
    record_operation(db, "vm_create_submit", f"提交创建虚拟机任务 ({data.region} / {data.vm_size})", resource=job_id, account_id=data.account_id, operator=_u)
    run_in_background(job_id, _do_create_vm, data.account_id, payload)
    return {"job_id": job_id}


def _do_vm_action(logger, account_id: int, resource_group: str, vm_name: str, action: str):
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        mgr, acct = get_manager(account_id, db, full=True)
        with proxy_env(acct):
            if action == "change_ip":
                result = mgr.change_vm_ip(resource_group, vm_name, wait=True, log_callback=logger)
            else:
                result = mgr.vm_action(action, resource_group, vm_name, wait=True, log_callback=logger)
        return {"ok": True, "data": result}
    finally:
        db.close()


_ACTION_TITLES = {
    "start": "启动", "stop": "关机", "restart": "重启",
    "delete": "删除", "change_ip": "更换公网 IP",
}


@router.post("/action")
def vm_action(data: VmActionIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if data.action not in _ACTION_TITLES:
        raise HTTPException(400, f"未知动作：{data.action}")
    acct = db.query(AzureAccount).filter_by(id=data.account_id).first()
    if not acct:
        raise HTTPException(404, "账号不存在")
    title = f"{_ACTION_TITLES[data.action]}虚拟机 {data.vm_name}"
    job_id = create_job("vm_action", title, data.account_id)
    record_operation(db, "vm_action_submit", f"提交{title}任务", resource=data.vm_name, account_id=data.account_id, operator=_u, detail={"job_id": job_id, "resource_group": data.resource_group, "action": data.action})
    run_in_background(job_id, _do_vm_action, data.account_id, data.resource_group, data.vm_name, data.action)
    return {"job_id": job_id}


@router.get("/{account_id}/{resource_group}/{vm_name}")
def vm_detail(account_id: int, resource_group: str, vm_name: str,
              db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(acct):
            data = mgr.get_vms()
        for vm in data.get("vms", []):
            if vm.get("name") == vm_name and vm.get("resource_group") == resource_group:
                return vm
        raise HTTPException(404, "虚拟机不存在")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取虚拟机详情失败：{e}")
