# Azure Panel（单用户版）部署说明

对标 AzureIn 面板主要功能（除多用户/资源共享外）：总览、Azure 账号、代理、账单费用、
资源配额、资源组、虚拟机、Foundry、初始化脚本、任务中心、API 访问、API 文档。

## 一键部署（VPS）

```bash
curl -fsSL https://github.com/SIJULY/azure/raw/main/install.sh | bash
```

脚本默认安装/更新到 `/opt/azure-panel`，自动执行 `git pull`、`docker compose up -d --build`，并保留 `./data` 数据目录。

自定义端口和首次管理员密码：

```bash
curl -fsSL https://github.com/SIJULY/azure/raw/main/install.sh | \
  PANEL_PORT=8080 ADMIN_USERNAME=admin ADMIN_PASSWORD='请改成强密码' bash
```

如需手动部署：把项目传到 VPS（示例放 `/opt/azure-panel`），修改 `docker-compose.yml` 中的 `ADMIN_PASSWORD`（首次启动生效），然后运行：

```bash
docker compose up -d --build
```

启动后访问 `http://VPS_IP:8080`，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。
首次登录后建议在右上角用户菜单里改密码。

## 数据

- 所有数据在 `./data`（SQLite + 加密密钥），备份这个目录即可迁移。
- Azure 服务主体的 `client_secret`、代理密码经 Fernet 加密后存库，接口永不返回明文。

## 使用流程

1. 「Azure 账号」→ 新增：填服务主体的 tenant_id / client_id / client_secret / subscription_id，
   提交时自动测试连接，通不过不入库。
2. 「代理」→ 如需让面板的 Azure API 调用走代理，在此配置（http / socks5）。
3. 「虚拟机」→ 创建、开关机、重启、删除、更换公网 IP（长耗时操作进「任务中心」看日志）。
4. 「Foundry」→ 创建 AI Services 资源、部署模型。
5. 「API 访问」→ 创建个人 Token，用 `Authorization: Bearer <token>` 调 `/api/*`。
6. 「API 文档」→ 内嵌 Swagger（`/api/docs`）。

## 端口

- 8080：面板 Web（含 API）。如需改端口，改 `docker-compose.yml` 中冒号左侧数字。
- 与 Hysteria2（20000-50000/UDP）无冲突。

## 常见问题

- 刷新子页面 404：后端已对非 `/api` 路径做 SPA fallback，不会 404。
- Azure 连接失败：先在「代理」里确认出口网络能直连 `management.azure.com`；
  如 VPS 在国内，直连 Azure 国际版可能需要代理。
- 换机器迁移：停掉容器，拷走 `./data` 目录即可。
