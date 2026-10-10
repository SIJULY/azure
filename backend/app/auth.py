"""JWT 认证 + API Token 认证。"""
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .config import JWT_SECRET_FILE, JWT_EXPIRE_HOURS
from .db import SessionLocal, User, ApiToken

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)


def _jwt_secret() -> str:
    if JWT_SECRET_FILE.exists():
        return JWT_SECRET_FILE.read_text().strip()
    s = secrets.token_urlsafe(48)
    JWT_SECRET_FILE.write_text(s)
    JWT_SECRET_FILE.chmod(0o600)
    return s


def hash_password(pw: str) -> str:
    return pwd_ctx.hash(pw)


def verify_password(pw: str, h: str) -> bool:
    return pwd_ctx.verify(pw, h)


def create_jwt(username: str) -> str:
    exp = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "exp": exp}, _jwt_secret(), algorithm="HS256")


def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def ensure_admin():
    """首次启动时用环境变量创建管理员账号。"""
    from .config import ADMIN_USERNAME, ADMIN_PASSWORD
    s = SessionLocal()
    try:
        if s.query(User).count() == 0:
            s.add(User(username=ADMIN_USERNAME, password_hash=hash_password(ADMIN_PASSWORD)))
            s.commit()
    finally:
        s.close()


def _user_from_jwt(token: str, db: Session):
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
        username = payload.get("sub")
    except JWTError:
        return None
    if not username:
        return None
    return db.query(User).filter_by(username=username).first()


def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
):
    if cred is None or not cred.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "未登录")
    token = cred.credentials
    # 1) 尝试 JWT
    user = _user_from_jwt(token, db)
    if user:
        return user
    # 2) 尝试 API Token
    h = hashlib.sha256(token.encode()).hexdigest()
    rec = db.query(ApiToken).filter_by(token_hash=h).first()
    if rec:
        rec.last_used_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        db.commit()
        # 返回一个伪 user 对象，username 固定
        admin = db.query(User).first()
        return admin
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效的凭证")


def new_api_token() -> str:
    return "ak-" + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
