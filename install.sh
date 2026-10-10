#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="azure-panel"
REPO_URL="${REPO_URL:-https://github.com/SIJULY/azure.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/azure-panel}"
PANEL_PORT="${PANEL_PORT:-8080}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
BRANCH="${BRANCH:-main}"
RAW_INSTALL_URL="${RAW_INSTALL_URL:-https://github.com/SIJULY/azure/raw/${BRANCH}/install.sh}"

log() { printf '\033[1;34m[azure-panel]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[azure-panel]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[azure-panel]\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    die "未检测到 Docker Compose。请先安装 Docker Compose 插件或 docker-compose。"
  fi
}

ensure_root_or_sudo() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    die "请使用 root 运行，或加 sudo：sudo bash install.sh"
  fi
}

clone_or_update_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    log "检测到已有项目，开始更新：$INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
  elif [ -e "$INSTALL_DIR" ] && [ "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')" != "0" ]; then
    die "安装目录已存在且不是 Git 仓库或非空：$INSTALL_DIR。请设置 INSTALL_DIR 到空目录，或手动处理该目录。"
  else
    log "首次安装，克隆仓库到：$INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

ensure_compose_file() {
  [ -f "$INSTALL_DIR/docker-compose.yml" ] || die "未找到 $INSTALL_DIR/docker-compose.yml"
}

apply_basic_config() {
  # 只改 compose 中本项目明确提供的默认值；data 卷保持 ./data，不会覆盖已有数据。
  python3 - "$INSTALL_DIR/docker-compose.yml" "$PANEL_PORT" "$ADMIN_USERNAME" "$ADMIN_PASSWORD" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
port, username, password = sys.argv[2], sys.argv[3], sys.argv[4]
text = path.read_text()
text = re.sub(r'-\s*"\d+:8000"', f'- "{port}:8000"', text, count=1)
text = re.sub(r'-\s*ADMIN_USERNAME=.*', f'- ADMIN_USERNAME={username}', text)
text = re.sub(r'-\s*ADMIN_PASSWORD=.*', f'- ADMIN_PASSWORD={password}', text)
path.write_text(text)
PY
}

up_service() {
  local compose_cmd="$1"
  log "构建并启动容器：$APP_NAME"
  (cd "$INSTALL_DIR" && $compose_cmd up -d --build)
}

show_result() {
  local compose_cmd="$1"
  local ip="服务器IP"
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -n "$ip" ] || ip="服务器IP"
  fi

  log "完成。"
  echo
  echo "访问地址： http://${ip}:${PANEL_PORT}"
  echo "默认账号： ${ADMIN_USERNAME}"
  echo "默认密码： ${ADMIN_PASSWORD}"
  echo
  echo "以后更新只需要运行："
  echo "  curl -fsSL ${RAW_INSTALL_URL} | bash"
  echo
  echo "常用命令："
  echo "  cd ${INSTALL_DIR}"
  echo "  ${compose_cmd} ps"
  echo "  docker logs ${APP_NAME} --tail 100"
  echo "  docker logs -f ${APP_NAME}"
  echo
  warn "首次登录后请尽快在面板内修改默认密码。"
}

main() {
  ensure_root_or_sudo
  require_cmd git
  require_cmd docker
  require_cmd python3

  local compose_cmd
  compose_cmd="$(detect_compose)"

  log "安装目录：$INSTALL_DIR"
  log "仓库地址：$REPO_URL"
  log "分支：$BRANCH"
  log "监听端口：$PANEL_PORT"

  clone_or_update_repo
  ensure_compose_file
  apply_basic_config
  up_service "$compose_cmd"
  show_result "$compose_cmd"
}

main "$@"