"""Fernet 对称加密：用于加密存储 Azure 服务主体 client_secret、代理密码等。"""
from cryptography.fernet import Fernet
from .config import SECRET_KEY_FILE


def _load_or_create_key() -> bytes:
    if SECRET_KEY_FILE.exists():
        return SECRET_KEY_FILE.read_bytes().strip()
    key = Fernet.generate_key()
    SECRET_KEY_FILE.write_bytes(key)
    SECRET_KEY_FILE.chmod(0o600)
    return key


_fernet = Fernet(_load_or_create_key())


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")
