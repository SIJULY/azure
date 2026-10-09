"""虚拟机：列表 / 创建表单元数据 / 创建（异步）/ 开关机等动作（异步）/ 详情。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User, AzureAccount
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached
from ..jobs import create_job, run_in_background
from ..vendor.azure_manager import AZURE_REGIONS_CN

router = APIRouter(prefix="/vms", tags=["虚拟机"])


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
            except Exception:
                vms = []
            for vm in vms:
                vid = vm.id or ""
                rg = vid.split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in vid else ""
                status = "unknown"
                if rg:
                    try:
                        detail = call_with_timeout(
                            lambda: mgr.compute_client.virtual_machines.get(rg, vm.name, expand="instanceView"),
                            timeout=10, timeout_msg="VM 状态查询超时")
                        for st in (detail.instance_view.statuses or []):
                            code = (st.code or "").lower()
                            if code.startswith("powerstate/"):
                                status = code.split("/", 1)[1]
                                break
                    except Exception:
                        pass
                public_ip = ""
                try:
                    def _get_ip():
                        nics = (vm.network_profile.network_interfaces or []) if vm.network_profile else []
                        if nics and rg:
                            nic_name = (nics[0].id or "").split("/")[-1]
                            nic = mgr.network_client.network_interfaces.get(rg, nic_name)
                            ip_cfgs = nic.ip_configurations or []
                            if ip_cfgs and ip_cfgs[0].public_ip_address:
                                pip_name = (ip_cfgs[0].public_ip_address.id or "").split("/")[-1]
                                pip = mgr.network_client.public_ip_addresses.get(rg, pip_name)
                                return pip.ip_address or ""
                        return ""
                    public_ip = call_with_timeout(_get_ip, timeout=10, timeout_msg="公网 IP 查询超时")
                except Exception:
                    pass
                out.append({
                    "id": vid, "name": vm.name, "location": vm.location,
                    "vm_size": (vm.hardware_profile.vm_size if vm.hardware_profile else ""),
                    "status": status, "resource_group": rg, "public_ip": public_ip,
                    "disk_size": "", "time_created": "",
                })
            return {"vms": out}
    finally:
        db.close()


@cached(ttl=60)
def _cached_vms(account_id: int) -> dict:
    return _do_list_vms(account_id)


class VmCreateIn(BaseModel):
    account_id: int
    region: str
    vm_size: str
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
def list_vms(account_id: int = Query(...), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        return _cached_vms(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取虚拟机列表失败：{e}")


@router.get("/meta")
def vm_meta(account_id: int = Query(...), region: str = Query(""), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(acct):
            regions = mgr.get_regions()
    except Exception as e:
        raise HTTPException(400, f"获取区域失败：{e}")
    out = {
        "regions": [{"code": r, "name_cn": AZURE_REGIONS_CN.get(r, r)} for r in regions],
        "vm_sizes": [],
        "os_images": [],
        "ip_permission": "",
    }
    if region:
        try:
            with proxy_env(acct):
                out["vm_sizes"] = mgr.get_supported_vm_sizes(region)
                out["ip_permission"] = mgr.get_ip_permission(region)
                if out["vm_sizes"]:
                    out["os_images"] = mgr.get_supported_os_images(region, out["vm_sizes"][0])
        except Exception as e:
            raise HTTPException(400, f"获取规格/镜像失败：{e}")
    return out


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
    job_id = create_job("create_vm", f"创建虚拟机 ({data.region} / {data.vm_size})", data.account_id)
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
