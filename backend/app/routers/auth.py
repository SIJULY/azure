"""认证路由：登录 / 改密码 / 当前用户。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user, verify_password, hash_password, create_jwt, ensure_admin
from ..db import User

router = APIRouter(prefix="/auth", tags=["认证"])


class LoginIn(BaseModel):
    username: str
    password: str


class ChangePwIn(BaseModel):
    old_password: str
    new_password: str


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(username=data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "用户名或密码错误")
    return {"access_token": create_jwt(user.username), "token_type": "bearer"}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"username": user.username}


@router.post("/change-password")
def change_password(data: ChangePwIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "原密码不正确")
    if len(data.new_password) < 6:
        raise HTTPException(400, "新密码至少 6 位")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"ok": True}
