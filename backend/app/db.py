"""SQLite 数据模型。"""
import json
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime, Boolean, ForeignKey
)
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DB_PATH

Base = declarative_base()


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(64), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(String(32), default=_now)


class AzureAccount(Base):
    __tablename__ = "azure_accounts"
    id = Column(Integer, primary_key=True)
    alias = Column(String(128), nullable=False)
    tenant_id = Column(String(128), nullable=False)
    client_id = Column(String(128), nullable=False)
    client_secret_enc = Column(Text, nullable=False)   # Fernet 加密
    subscription_id = Column(String(128), nullable=False)
    subscription_name = Column(String(256), default="")
    quota_tier = Column(String(64), default="")
    status = Column(String(16), default="healthy")     # healthy | error
    status_msg = Column(Text, default="")
    proxy_id = Column(Integer, ForeignKey("proxies.id"), nullable=True)  # 绑定的代理
    last_checked = Column(String(32), nullable=True)   # 最后检测时间
    supported_regions = Column(Text, default="")        # JSON: 账号支持的区域列表，首次拉取后持久化（不变的数据）
    region_vm_sizes = Column(Text, default="")         # JSON: {region: [sizes]}，首次拉取后持久化（不变的数据）
    created_at = Column(String(32), default=_now)
    updated_at = Column(String(32), default=_now, onupdate=_now)


class ProxyConfig(Base):
    __tablename__ = "proxy_config"
    id = Column(Integer, primary_key=True)            # 恒为 1，单行配置
    enabled = Column(Boolean, default=False)
    protocol = Column(String(16), default="http")     # http | socks5
    host = Column(String(256), default="")
    port = Column(Integer, default=0)
    username = Column(String(128), default="")
    password_enc = Column(Text, default="")


class Proxy(Base):
    """代理列表：AzureIn 模式，账号可绑定代理。"""
    __tablename__ = "proxies"
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    protocol = Column(String(16), default="http")     # http | https | socks5
    host = Column(String(256), nullable=False)
    port = Column(Integer, nullable=False)
    username = Column(String(128), default="")
    password_enc = Column(Text, default="")
    is_default = Column(Boolean, default=False)       # 默认全局代理
    created_at = Column(String(32), default=_now)


class InitScript(Base):
    __tablename__ = "init_scripts"
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    description = Column(String(512), default="")
    content = Column(Text, nullable=False)
    os_type = Column(String(16), default="linux")
    created_at = Column(String(32), default=_now)
    updated_at = Column(String(32), default=_now, onupdate=_now)


class Job(Base):
    __tablename__ = "jobs"
    id = Column(String(36), primary_key=True)         # uuid
    type = Column(String(64), nullable=False)         # create_vm | vm_action | foundry_ensure | foundry_deploy
    title = Column(String(256), nullable=False)
    account_id = Column(Integer, ForeignKey("azure_accounts.id"), nullable=True)
    status = Column(String(16), default="pending")    # pending | running | success | failed
    attempts = Column(Integer, default=1)              # 尝试次数
    logs_json = Column(Text, default="[]")            # [{time, level, message}]
    result_json = Column(Text, default="{}")
    created_at = Column(String(32), default=_now)
    updated_at = Column(String(32), default=_now, onupdate=_now)
    finished_at = Column(String(32), nullable=True)

    def logs(self):
        try:
            return json.loads(self.logs_json or "[]")
        except Exception:
            return []

    def result(self):
        try:
            return json.loads(self.result_json or "{}")
        except Exception:
            return {}


class OperationLog(Base):
    """操作审计日志：记录面板内所有重要用户操作。"""
    __tablename__ = "operation_logs"
    id = Column(Integer, primary_key=True)
    type = Column(String(64), nullable=False)
    title = Column(String(256), nullable=False)
    resource = Column(String(256), default="")
    account_id = Column(Integer, nullable=True)
    status = Column(String(16), default="success")
    operator = Column(String(64), default="系统")
    detail_json = Column(Text, default="{}")
    created_at = Column(String(32), default=_now)


class ApiToken(Base):
    __tablename__ = "api_tokens"
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    prefix = Column(String(16), nullable=False)        # token 前 8 位，用于展示
    token_hash = Column(String(128), unique=True, nullable=False)  # sha256
    created_at = Column(String(32), default=_now)
    last_used_at = Column(String(32), nullable=True)


engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    Base.metadata.create_all(engine)
    _migrate()


def _migrate():
    """轻量迁移：给已存在的表补新增列（SQLite 用 PRAGMA 检查后 ALTER TABLE）。"""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    try:
        def cols(table):
            return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        want = {
            "jobs": [("attempts", "INTEGER DEFAULT 1"), ("updated_at", "VARCHAR(32)")],
            "azure_accounts": [("proxy_id", "INTEGER"), ("last_checked", "VARCHAR(32)"), ("supported_regions", "TEXT DEFAULT ''"), ("region_vm_sizes", "TEXT DEFAULT ''")],
            "init_scripts": [("os_type", "VARCHAR(16) DEFAULT 'linux'")],
        }
        for table, columns in want.items():
            try:
                existing = cols(table)
            except Exception:
                continue
            for name, ddl in columns:
                if name not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
        conn.commit()
    finally:
        conn.close()
    # 确保 proxy 单行配置存在
    s = SessionLocal()
    try:
        if s.query(ProxyConfig).count() == 0:
            s.add(ProxyConfig(id=1))
            s.commit()
    finally:
        s.close()
