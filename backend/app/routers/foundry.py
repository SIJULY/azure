"""Foundry：区域 / 模型可用性 / 创建 AI Services 资源 / 部署模型。资源列表带 90 秒缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import AzureAccount, User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached, cache_invalidate
from ..jobs import create_job, run_in_background

router = APIRouter(prefix="/foundry", tags=["Foundry"])


def is_foundry_account(account) -> bool:
    """Return True for Cognitive Services accounts that are usable as Foundry/OpenAI resources.

    Azure's Microsoft.CognitiveServices/accounts provider can also return speech,
    language, translator, etc. Counting all of them makes the Overview Foundry card
    larger than the actual Foundry resources managed by this page.
    """
    kind = str(getattr(account, "kind", "") or "").strip().lower()
    return kind in {"aiservices", "openai"}


class EnsureIn(BaseModel):
    account_id: int
    region: str
    resource_group: str = "rg-foundry"
    name: str = ""


class DeployIn(BaseModel):
    account_id: int
    region: str
    resource_group: str = "rg-foundry"
    foundry_name: str = ""          # 已有 Foundry 资源名（ensure 返回的 name）
    deployment_name: str
    model_name: str
    model_version: str
    sku_name: str = "Standard"
    capacity: int = 1


@router.get("/regions")
def foundry_regions(account_id: int = Query(...), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, _a = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(_a):
            ok, regions, msg = mgr.get_foundry_regions()
        if not ok:
            raise HTTPException(400, f"获取 Foundry 区域失败：{msg}")
        return {"regions": regions}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取 Foundry 区域失败：{e}")


@router.get("/models")
def foundry_models(account_id: int = Query(...), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, _a = get_manager(account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(_a):
            ok, data, msg = mgr.get_foundry_model_availability({})
        if not ok:
            raise HTTPException(400, f"获取模型列表失败：{msg}")
        return data if isinstance(data, dict) else {"models": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取模型列表失败：{e}")


def _do_foundry_resources(account_id: int) -> list:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        mgr, _a = get_manager(account_id, db)
    except Exception as e:
        db.close()
        raise RuntimeError(str(e))
    try:
        from azure.mgmt.cognitiveservices import CognitiveServicesManagementClient
        with proxy_env(_a):
            cs = CognitiveServicesManagementClient(mgr.credential, mgr.subscription_id)
            accounts = call_with_timeout(
                lambda: list(cs.accounts.list()),
                timeout=20, timeout_msg="Foundry 资源查询超时")
        return [
            {
                "name": a.name,
                "resource_group": a.id.split("/")[4],
                "location": a.location,
                "sku": a.sku.name if a.sku else "",
                "kind": a.kind,
            }
            for a in accounts
            if is_foundry_account(a)
        ]
    finally:
        db.close()


@cached(ttl=600)
def _cached_foundry_resources(account_id: int) -> list:
    return _do_foundry_resources(account_id)


@router.get("/resources")
def foundry_resources(account_id: int = Query(...), refresh: bool = Query(False), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        if refresh:
            cache_invalidate("_cached_foundry_resources")
        return _cached_foundry_resources(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取 Foundry 资源失败：{e}")


def _do_ensure(logger, account_id: int, region: str, resource_group: str, name: str = ""):
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        mgr, _a = get_manager(account_id, db)
        with proxy_env(_a):
            ok, data, msg = mgr.ensure_foundry_resource(region, resource_group, account_name=name or None, log_callback=logger)
        if not ok:
            raise RuntimeError(msg or "创建 Foundry 资源失败")
        return {"ok": True, "data": data}
    finally:
        db.close()


@router.post("/ensure")
def foundry_ensure(data: EnsureIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not db.query(AzureAccount).filter_by(id=data.account_id).first():
        raise HTTPException(404, "账号不存在")
    job_id = create_job("foundry_ensure", f"创建 Foundry 资源 ({data.region})", data.account_id)
    run_in_background(job_id, _do_ensure, data.account_id, data.region, data.resource_group, data.name)
    return {"job_id": job_id}


def _do_deploy(logger, account_id: int, payload: dict):
    from ..db import SessionLocal
    db = SessionLocal()
    try:
        mgr, _a = get_manager(account_id, db, full=True)
        with proxy_env(_a):
            ok, data, msg = mgr.deploy_foundry_model(
                {"name": payload["foundry_name"], "resource_group": payload["resource_group"],
                 "region": payload["region"]},
                payload["deployment_name"], payload["model_name"], payload["model_version"],
                sku_name=payload.get("sku_name") or "Standard",
                capacity=int(payload.get("capacity") or 1),
                log_callback=logger,
            )
        if not ok:
            raise RuntimeError(msg or "部署模型失败")
        return {"ok": True, "data": data}
    finally:
        db.close()


@router.post("/deploy")
def foundry_deploy(data: DeployIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not db.query(AzureAccount).filter_by(id=data.account_id).first():
        raise HTTPException(404, "账号不存在")
    job_id = create_job(
        "foundry_deploy",
        f"部署模型 {data.model_name} ({data.deployment_name})",
        data.account_id,
    )
    run_in_background(job_id, _do_deploy, data.account_id, data.model_dump())
    return {"job_id": job_id}
