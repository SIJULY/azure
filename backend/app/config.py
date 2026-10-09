"""应用配置：全部可通过环境变量覆盖。"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "panel.db"

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

# Fernet 密钥：首次启动自动生成并持久化到 data/secret.key
SECRET_KEY_FILE = DATA_DIR / "secret.key"

JWT_SECRET_FILE = DATA_DIR / "jwt.key"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "72"))

API_PREFIX = "/api/v1"
