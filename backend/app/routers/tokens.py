"""API 访问：个人 Token 的创建 / 列表 / 撤销。Token 明文只在创建时返回一次。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user, new_api_token, hash_token
from ..db import ApiToken, User
from ..operations import record_operation

router = APIRouter(prefix="/tokens", tags=["API 访问"])


class TokenIn(BaseModel):
    name: str


@router.get("")
def list_tokens(db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    return [
        {"id": t.id, "name": t.name, "prefix": t.prefix,
         "created_at": t.created_at, "last_used_at": t.last_used_at}
        for t in db.query(ApiToken).order_by(ApiToken.id).all()
    ]


@router.post("")
def create_token(data: TokenIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not data.name.strip():
        raise HTTPException(400, "名称不能为空")
    token = new_api_token()
    rec = ApiToken(name=data.name.strip(), prefix=token[:8], token_hash=hash_token(token))
    db.add(rec)
    db.commit()
    db.refresh(rec)
    record_operation(db, "token_create", f"生成 API Token {rec.name}", resource=rec.prefix, operator=_u)
    return {"id": rec.id, "name": rec.name, "token": token}


@router.delete("/{token_id}")
def revoke_token(token_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    t = db.query(ApiToken).filter_by(id=token_id).first()
    if not t:
        raise HTTPException(404, "Token 不存在")
    name = t.name
    prefix = t.prefix
    db.delete(t)
    db.commit()
    record_operation(db, "token_revoke", f"撤销 API Token {name}", resource=prefix, operator=_u)
    return {"ok": True}
