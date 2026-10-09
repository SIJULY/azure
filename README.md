# Azure 面板 (Azure Panel)

单用户自用的 Azure 资源管理面板，参照 [AzureIn](https://azure.684208.xyz) 的布局与功能。

## 功能

- **总览**：账号、资源组、虚拟机、Foundry 统计
- **Azure 账号**：服务主体凭据管理、批量导入、代理绑定
- **代理**：HTTP/HTTPS/SOCKS5 代理管理、批量添加
- **账单费用**：Cost Management 费用查询、趋势图
- **资源配额**：Compute 配额、Foundry 模型配额、OpenAI 层级
- **资源组**：创建/查看/删除
- **虚拟机**：卡片列表、开机/关机/更换 IP/创建
- **防火墙**：NSG 规则管理
- **Foundry**：配额层级表、创建账号、批量部署模型
- **初始化脚本**：cloud-init / PowerShell 模板
- **任务中心**：异步任务跟踪
- **API 访问**：个人 Token 管理
- **API 文档**：自研 OpenAPI 文档面板

## 部署

### 一键安装 / 更新

```bash
curl -fsSL https://github.com/SIJULY/azure/raw/main/install.sh | bash
```

默认安装到 `/opt/azure-panel`，访问端口 `8080`，默认账号 `admin / admin123`。

自定义安装目录、端口或初始管理员密码：

```bash
curl -fsSL https://github.com/SIJULY/azure/raw/main/install.sh | \
  INSTALL_DIR=/opt/azure-panel PANEL_PORT=8080 ADMIN_USERNAME=admin ADMIN_PASSWORD='请改成强密码' bash
```

已安装后再次运行同一条命令即可自动 `git pull` 并重新构建启动，`./data` 数据目录会保留。

### 手动部署

```bash
# 1. 克隆
git clone https://github.com/SIJULY/azure.git
cd azure

# 2. 构建并启动
docker-compose build
docker-compose up -d

# 3. 访问 http://服务器IP:8080
# 默认账号：admin / admin123（首次登录后请修改密码）
```

## 配置

- 数据持久化在 `./data` 目录（SQLite）
- 修改 `docker-compose.yml` 中的端口映射可更改访问端口
- 生产环境建议在前面加 Caddy/Nginx 反向代理并配置 HTTPS

## 技术栈

- 后端：FastAPI + SQLite + azure-mgmt-* SDK
- 前端：React + Vite + Tailwind CSS
- 部署：Docker + docker-compose
