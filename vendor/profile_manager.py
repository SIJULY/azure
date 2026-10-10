import os
import json
import logging
import stat
import tempfile
from typing import Dict, List, Optional

USER_HOME = os.path.expanduser("~")
CONFIG_DIR = os.path.join(USER_HOME, ".oci_manager_config")

PROFILES_FILE_PATH = os.path.join(CONFIG_DIR, "oci_profiles.json")
SETTINGS_FILE_PATH = os.path.join(CONFIG_DIR, "oci_gui_settings.json")
SSH_PROFILES_FILE_PATH = os.path.join(CONFIG_DIR, "oci_ssh_profiles.json")
CLOUDFLARE_CONFIG_PATH = os.path.join(CONFIG_DIR, "cloudflare_config.json")

# 仅属主可读写 / 可进入。配置目录里存的是各云的私钥与明文密钥，
# 默认的 755+644 会让同机器上的其他用户直接读走。
_DIR_MODE = stat.S_IRWXU                              # 0700
_FILE_MODE = stat.S_IRUSR | stat.S_IWUSR              # 0600


def ensure_config_dir() -> str:
    """确保配置目录存在且权限为 0700，返回目录路径。"""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        if stat.S_IMODE(os.stat(CONFIG_DIR).st_mode) != _DIR_MODE:
            os.chmod(CONFIG_DIR, _DIR_MODE)
    except OSError as e:
        logging.warning(f"无法收敛配置目录权限: {e}")
    return CONFIG_DIR


def secure_chmod(path: str) -> None:
    """把单个凭据文件的权限收敛为 0600，失败只记日志不打断流程。"""
    try:
        if os.path.exists(path):
            os.chmod(path, _FILE_MODE)
    except OSError as e:
        logging.warning(f"无法收敛文件权限 {path}: {e}")


def secure_write_text(path: str, text: str) -> bool:
    """
    原子写入文本并设置 0600 权限。

    先写同目录下的临时文件再 rename，避免写到一半被中断（例如退出时的强杀）
    留下一个被截断的凭据文件。
    """
    ensure_config_dir()
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path) or CONFIG_DIR, suffix=".tmp")
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp_path, _FILE_MODE)
        os.replace(tmp_path, path)
        return True
    except Exception as e:
        logging.error(f"写入文件失败 {path}: {e}")
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError as cleanup_err:
                # 主错误上面已经记了；这里只是清理残留的 .tmp，用 debug 就够，
                # 但不能完全静默——配置目录里堆积 .tmp 时需要知道原因。
                logging.debug(f"清理临时文件失败 {tmp_path}: {cleanup_err}")
        return False


def secure_write_json(path: str, data, ensure_ascii: bool = False) -> bool:
    """原子写入 JSON 并设置 0600 权限。"""
    try:
        text = json.dumps(data, indent=4, ensure_ascii=ensure_ascii)
    except Exception as e:
        logging.error(f"序列化 JSON 失败 {path}: {e}")
        return False
    return secure_write_text(path, text)


def harden_existing_config_permissions() -> None:
    """
    启动时把历史遗留的宽权限配置文件收敛掉。

    早期版本用默认权限（0644）写盘，这些文件已经存在于用户机器上，
    仅靠新写入路径无法修复，需要启动时主动扫一遍。
    """
    if not os.path.isdir(CONFIG_DIR):
        return
    try:
        if stat.S_IMODE(os.stat(CONFIG_DIR).st_mode) != _DIR_MODE:
            os.chmod(CONFIG_DIR, _DIR_MODE)
    except OSError as e:
        logging.warning(f"无法收敛配置目录权限: {e}")
        return

    for name in os.listdir(CONFIG_DIR):
        # 日志不含凭据，且用户可能想用别的工具查看，不动它
        if name.endswith(".log"):
            continue
        full = os.path.join(CONFIG_DIR, name)
        if not os.path.isfile(full):
            continue
        try:
            if stat.S_IMODE(os.stat(full).st_mode) & ~_FILE_MODE:
                os.chmod(full, _FILE_MODE)
                logging.info(f"已收敛历史配置文件权限: {name}")
        except OSError as e:
            logging.warning(f"无法收敛文件权限 {name}: {e}")


def load_cloudflare_config() -> dict:
    """读取 Cloudflare 配置。键为 api_token / zone_id / domain。"""
    if os.path.exists(CLOUDFLARE_CONFIG_PATH):
        try:
            with open(CLOUDFLARE_CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logging.error(f"读取 Cloudflare 配置失败: {e}")
            return {}
    return {}


def save_cloudflare_config(config: dict) -> bool:
    """写入 Cloudflare 配置，成功返回 True。文件含 API 令牌，权限收敛为 0600。"""
    return secure_write_json(CLOUDFLARE_CONFIG_PATH, config)


class GlobalSSHKeyManager:
    """全局 SSH 密钥及默认凭据管理器"""
    def __init__(self, prefix=""):
        self.config_dir = CONFIG_DIR
        self.pub_key_path = os.path.join(self.config_dir, f"{prefix}global_ssh.pub")
        self.priv_key_path = os.path.join(self.config_dir, f"{prefix}global_ssh.pem")
        self.config_path = os.path.join(self.config_dir, f"{prefix}global_ssh_config.json")
        self.pub_key = ""
        self.priv_key = ""
        self.default_user = "root"
        self.default_password = ""
        self.load_keys()

    def load_keys(self):
        try:
            if os.path.exists(self.pub_key_path):
                with open(self.pub_key_path, 'r', encoding='utf-8') as f:
                    self.pub_key = f.read().strip()
            if os.path.exists(self.priv_key_path):
                with open(self.priv_key_path, 'r', encoding='utf-8') as f:
                    self.priv_key = f.read().strip()
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self.default_user = config.get("default_user", "root")
                    self.default_password = config.get("default_password", "")
        except Exception as e:
            logging.error(f"Failed to load global SSH keys/config: {e}")

    def update_keys(self, pub: str, priv: str, default_user: str = "root", default_password: str = ""):
        # 私钥与默认密码均为敏感内容，统一走 0600 的原子写入。
        if not secure_write_text(self.pub_key_path, pub):
            return False
        if not secure_write_text(self.priv_key_path, priv):
            return False

        config = {
            "default_user": default_user,
            "default_password": default_password
        }
        if not secure_write_json(self.config_path, config):
            return False

        self.pub_key = pub
        self.priv_key = priv
        self.default_user = default_user
        self.default_password = default_password
        return True

class ProfileManager:
    """账号配置与全局设置管理器"""
    def __init__(self):
        ensure_config_dir()

        self.profiles: Dict[str, dict] = {}
        self.profile_order: List[str] = []
        self.last_used_alias: Optional[str] = None
        self.ssh_profiles: Dict[str, dict] = {}
        
        self.ssh_key_manager = GlobalSSHKeyManager()
        
        self.load_profiles()
        self.load_settings()
        self.load_ssh_profiles()

    def load_profiles(self):
        try:
            if os.path.exists(PROFILES_FILE_PATH):
                with open(PROFILES_FILE_PATH, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        if "profiles" in data and isinstance(data["profiles"], dict):
                            self.profiles = data["profiles"]
                            if "profile_order" in data and isinstance(data["profile_order"], list):
                                self.profile_order = data["profile_order"]
                        else:
                            self.profiles = data
                    else:
                        self.profiles = {}
        except Exception as e:
            logging.error(f"Failed to load profiles: {e}")
            self.profiles = {}

    def save_profiles(self):
        # 含 OCI PEM 私钥全文
        secure_write_json(PROFILES_FILE_PATH, self.profiles)

    def load_settings(self):
        try:
            if os.path.exists(SETTINGS_FILE_PATH):
                with open(SETTINGS_FILE_PATH, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                    self.last_used_alias = settings.get("last_profile_alias")
                    if not self.profile_order:
                        self.profile_order = settings.get("profile_order", [])
        except Exception as e:
            logging.error(f"Failed to load settings: {e}")

    def save_settings(self):
        settings = {
            "last_profile_alias": self.last_used_alias,
            "profile_order": self.profile_order
        }
        secure_write_json(SETTINGS_FILE_PATH, settings)

    def load_ssh_profiles(self):
        try:
            if os.path.exists(SSH_PROFILES_FILE_PATH):
                with open(SSH_PROFILES_FILE_PATH, 'r', encoding='utf-8') as f:
                    self.ssh_profiles = json.load(f)
        except Exception as e:
            logging.error(f"Failed to load SSH profiles: {e}")

    def save_ssh_profiles(self):
        # 含各实例的 SSH 密码 / 私钥
        secure_write_json(SSH_PROFILES_FILE_PATH, self.ssh_profiles)

    def add_profile(self, alias: str, data: dict):
        self.profiles[alias] = data
        if alias not in self.profile_order:
            self.profile_order.append(alias)
        self.save_profiles()
        self.save_settings()

    def remove_profile(self, alias: str):
        if alias in self.profiles:
            del self.profiles[alias]
        if alias in self.profile_order:
            self.profile_order.remove(alias)
        if self.last_used_alias == alias:
            self.last_used_alias = None
        self.save_profiles()
        self.save_settings()