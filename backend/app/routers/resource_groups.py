"""资源组：列表 / 创建。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User
from ..azure_svc import get_manager, proxy_env, call_with_timeout

router = APIRouter(prefix="/resource-groups", tags=["资源组"])


class RgCreate(BaseModel):
    account_id: int
    name: str
    location: str
    tags: str = ""


@router.get("")
def list_resource_groups(account_id: int = Query(...), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(acct):
            rgs = list(mgr.resource_client.resource_groups.list())
            # 统计每个 RG 下的 VM 数量（轻量，只取 id 解析 RG）
            try:
                vm_count = {}
                for vm in mgr.compute_client.virtual_machines.list_all():
                    m = vm.id or ""
                    rg = m.split("/resourceGroups/")[1].split("/")[0] if "/resourceGroups/" in m else ""
                    if rg:
                        vm_count[rg] = vm_count.get(rg, 0) + 1
            except Exception:
                vm_count = {}
            return [
                {
                    "name": rg.name,
                    "location": rg.location,
                    "tags": dict(rg.tags or {}),
                    "vm_count": vm_count.get(rg.name, 0),
                }
                for rg in rgs
            ]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取资源组失败：{e}")


@router.post("")
def create_resource_group(data: RgCreate, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """创建资源组。"""
    if not data.name.strip():
        raise HTTPException(400, "资源组名称不能为空")
    if not data.location.strip():
        raise HTTPException(400, "请选择区域")
    try:
        mgr, acct = get_manager(data.account_id, db, full=True)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        # 解析标签：每行 key=value
        tag_dict = {}
        for line in (data.tags or "").splitlines():
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                if k.strip():
                    tag_dict[k.strip()] = v.strip()
        with proxy_env(acct):
            rg = call_with_timeout(
                lambda: mgr.resource_client.resource_groups.create_or_update(
                    data.name.strip(), {"location": data.location.strip(), "tags": tag_dict}),
                timeout=30, timeout_msg="创建资源组超时")
        return {"ok": True, "name": rg.name, "location": rg.location}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"创建资源组失败：{e}")


class RgDelete(BaseModel):
    account_id: int
    name: str


@router.post("/delete")
def delete_resource_group(data: RgDelete, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """删除资源组（会删除其中全部资源）。"""
    if not data.name.strip():
        raise HTTPException(400, "资源组名称不能为空")
    try:
        mgr, acct = get_manager(data.account_id, db, full=True)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(acct):
            poller = call_with_timeout(
                lambda: mgr.resource_client.resource_groups.begin_delete(data.name.strip()),
                timeout=30, timeout_msg="删除资源组超时")
            # 等待删除完成（最多 120 秒）
            call_with_timeout(lambda: poller.result(), timeout=120, timeout_msg="删除资源组超时")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"删除资源组失败：{e}")
