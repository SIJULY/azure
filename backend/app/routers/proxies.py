"""代理：代理列表的增删改查 + 连通性测试 + 设为默认。对标 AzureIn /proxies。"""
import socket
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import Proxy, AzureAccount, User
from .. import crypto
from ..azure_svc import _proxy_url_of

router = APIRouter(prefix="/proxies", tags=["代理"])


class ProxyIn(BaseModel):
    name: str
    protocol: str = "http"       # http | https | socks5
    host: str
    port: int
    username: str = ""
    password: str = ""           # 为空表示不修改（新建时可空）
    is_default: bool = False


def _out(p: Proxy, db: Session) -> dict:
    bound = db.query(AzureAccount).filter_by(proxy_id=p.id).count()
    return {
        "id": p.id,
        "name": p.name,
        "protocol": p.protocol,
        "host": p.host,
        "port": p.port,
        "username": p.username or "",
        "password_set": bool(p.password_enc),
        "is_default": bool(p.is_default),
        "bound_accounts": bound,
        "created_at": p.created_at,
    }


@router.get("")
def list_proxies(q: str = Query(""), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    query = db.query(Proxy).order_by(Proxy.id)
    if q:
        like = f"%{q}%"
        query = query.filter((Proxy.name.like(like)) | (Proxy.host.like(like)))
    return [_out(p, db) for p in query.all()]


@router.post("")
def create_proxy(data: ProxyIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    if not data.name.strip() or not data.host.strip() or not data.port:
        raise HTTPException(400, "名称、地址、端口不能为空")
    if data.protocol not in ("http", "https", "socks5"):
        raise HTTPException(400, "协议必须为 http / https / socks5")
    p = Proxy(
        name=data.name.strip(),
        protocol=data.protocol,
        host=data.host.strip(),
        port=int(data.port),
        username=data.username.strip(),
        password_enc=crypto.encrypt(data.password) if data.password else "",
    )
    if data.is_default:
        db.query(Proxy).update({Proxy.is_default: False})
        p.is_default = True
    db.add(p)
    db.commit()
    db.refresh(p)
    return _out(p, db)


@router.put("/{proxy_id}")
def update_proxy(proxy_id: int, data: ProxyIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    p = db.query(Proxy).filter_by(id=proxy_id).first()
    if not p:
        raise HTTPException(404, "代理不存在")
    p.name = data.name.strip()
    p.protocol = data.protocol if data.protocol in ("http", "https", "socks5") else "http"
    p.host = data.host.strip()
    p.port = int(data.port or 0)
    p.username = data.username.strip()
    if data.password:
        p.password_enc = crypto.encrypt(data.password)
    if data.is_default:
        db.query(Proxy).filter(Proxy.id != p.id).update({Proxy.is_default: False})
    p.is_default = data.is_default
    db.commit()
    return _out(p, db)


@router.delete("/{proxy_id}")
def delete_proxy(proxy_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    p = db.query(Proxy).filter_by(id=proxy_id).first()
    if not p:
        raise HTTPException(404, "代理不存在")
    bound = db.query(AzureAccount).filter_by(proxy_id=p.id).count()
    if bound:
        raise HTTPException(400, f"该代理正被 {bound} 个 Azure 账号引用，不能删除")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{proxy_id}/test")
def test_proxy(proxy_id: int, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    """测试代理连通性：TCP 连接代理地址端口。"""
    p = db.query(Proxy).filter_by(id=proxy_id).first()
    if not p:
        raise HTTPException(404, "代理不存在")
    try:
        s = socket.create_connection((p.host, p.port), timeout=8)
        s.close()
        return {"ok": True, "message": f"{p.host}:{p.port} 连接成功"}
    except Exception as e:
        raise HTTPException(400, f"连接失败：{e}")
