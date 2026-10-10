"""初始化脚本：cloud-init / user_data 脚本库，创建 VM 时可选用。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import InitScript, User
from ..operations import record_operation

router = APIRouter(prefix="/scripts", tags=["初始化脚本"])


class ScriptIn(BaseModel):
    name: str
    description: str = ""
    content: str
    os_type: str = "linux"


def _out(s: InitScript) -> dict:
    return {
        "id": s.id, "name": s.name, "description": s.description or "",
        "content": s.content, "os_type": getattr(s, "os_type", "linux") or "linux",
        "created_at": s.created_at, "updated_at": s.updated_at,
    }
    return {
        "id": s.id, "name": s.name, "description": s.description or "",
        "content": s.content, "created_at": s.created_at, "updated_at": s.updated_at,
    }


@router.get("")
def list_scripts(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    return [_out(s) for s in db.query(InitScript).order_by(InitScript.id).all()]


@router.post("")
def create_script(data: ScriptIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not data.content.strip():
        raise HTTPException(400, "脚本内容不能为空")
    s = InitScript(name=data.name.strip(), description=data.description, content=data.content, os_type=data.os_type or "linux")
    db.add(s)
    db.commit()
    db.refresh(s)
    record_operation(db, "script_create", f"创建初始化脚本 {s.name}", resource=s.name, operator=_u)
    return _out(s)


@router.put("/{script_id}")
def update_script(script_id: int, data: ScriptIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    s = db.query(InitScript).filter_by(id=script_id).first()
    if not s:
        raise HTTPException(404, "脚本不存在")
    s.name = data.name.strip()
    s.description = data.description
    s.content = data.content
    s.os_type = data.os_type or "linux"
    db.commit()
    record_operation(db, "script_update", f"更新初始化脚本 {s.name}", resource=s.name, operator=_u)
    return _out(s)


@router.delete("/{script_id}")
def delete_script(script_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    s = db.query(InitScript).filter_by(id=script_id).first()
    if not s:
        raise HTTPException(404, "脚本不存在")
    name = s.name
    db.delete(s)
    db.commit()
    record_operation(db, "script_delete", f"删除初始化脚本 {name}", resource=name, operator=_u)
    return {"ok": True}
