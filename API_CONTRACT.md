# Azure Panel API 契约 v1（单用户版）

Base URL: `/api`，除登录外全部需要 `Authorization: Bearer <jwt>`。
所有时间字符串格式：`YYYY-MM-DD HH:MM:SS`。错误统一格式：`{"detail": "..."}`。

## 认证

- `POST /api/auth/login` `{username, password}` → `{access_token, token_type: "bearer"}`
- `GET /api/auth/me` → `{username}`
- `POST /api/auth/change-password` `{old_password, new_password}` → `{ok: true}`

## 总览

- `GET /api/overview` → 
```json
{
  "accounts": {"total": 1, "healthy": 1, "error": 0},
  "resource_groups": {"total": 5},
  "vms": {"running": 2, "stopped": 1, "total": 3},
  "foundry": {"total": 1},
  "billing": {"month_to_date": 12.34, "currency": "USD"},
  "recent_jobs": [Job]
}
```

## Azure 账号

- `GET /api/accounts` → `[{id, alias, subscription_id, subscription_name, quota_tier, status: "healthy"|"error", status_msg, created_at, updated_at}]`（不返回 secret）
- `POST /api/accounts` `{alias, tenant_id, client_id, client_secret, subscription_id}` → 创建并测试连接，返回账号（不含 secret）
- `PUT /api/accounts/{id}` `{alias?, tenant_id?, client_id?, client_secret?, subscription_id?}` → 更新并重测
- `DELETE /api/accounts/{id}` → 删除
- `POST /api/accounts/{id}/test` → `{ok: true, subscription_name, quota_tier}` 或 400 `{detail}`

## 代理

- `GET /api/proxy` → `{enabled: false, protocol: "http"|"socks5", host, port, username?, password_set: bool}`
- `PUT /api/proxy` `{enabled, protocol, host, port, username?, password?}` → 保存（password 为空表示不改）
- 说明：启用后后端所有 Azure API 调用走该代理。

## 账单费用

- `GET /api/billing?account_id=1` → `{month_to_date: 12.34, currency: "USD", history_12m: [{month: "2026-09", cost: 10.1}], account_alias}`
- `GET /api/billing/summary` → 全部账号汇总 `[{account_id, alias, month_to_date, currency}]`

## 资源配额

- `GET /api/quotas?account_id=1` → `{quota_tier: "Tier 1", cognitiveservices: {...}, raw: {...}}`

## 资源组

- `GET /api/resource-groups?account_id=1` → `[{name, location, tags, vm_count}]`

## 虚拟机

- `GET /api/vms?account_id=1` → `{alias, vms: [{id, name, location, vm_size, status, resource_group, public_ip, ip_allocation_method, disk_size, time_created}]}`
- `GET /api/vms/meta?account_id=1&region=eastasia` → `{regions: [{code, name_cn}], vm_sizes: [...], os_images: [{key, label}]}`（用于创建表单）
- `POST /api/vms` `{account_id, region, vm_size, os_image, disk_size_gb?, disk_type?, ip_type?: "Static"|"Dynamic", vm_name?, username?, password?, ssh_key?, user_data? (初始化脚本内容), dd_system?: bool}` → `{job_id}`（异步创建，轮询任务中心）
- `POST /api/vms/action` `{account_id, resource_group, vm_name, action: "start"|"stop"|"restart"|"delete"|"change_ip"}` → `{job_id}`（delete=删除整个资源组）
- `GET /api/vms/{account_id}/{resource_group}/{vm_name}` → 单台详情

## 防火墙（NSG 规则）

- `GET /api/firewall?account_id=1` → `[{id(nsg_id), name, resource_group, location, rules: [{name, priority, direction, access, protocol, src_prefix, src_port, dst_port, description}]}]`
- `POST /api/firewall/rules` `{account_id, resource_group, nsg_name, rule: {name, priority, direction: "Inbound"|"Outbound", access: "Allow"|"Deny", protocol: "Tcp"|"Udp"|"*", src_prefix?, src_port?, dst_port, description?}}` → `{ok: true}`
- `DELETE /api/firewall/rules` `{account_id, resource_group, nsg_name, rule_name}` → `{ok: true}`

## Foundry

- `GET /api/foundry/regions?account_id=1` → `{regions: [...]}`
- `GET /api/foundry/models?account_id=1` → `{models: [{name, version, skus: [{name, capacity}...]}]}`（近12个月官方模型+可部署SKU）
- `POST /api/foundry/ensure` `{account_id, region, resource_group?: "rg-foundry"}` → `{job_id}`（创建/复用 AI Services 资源）
- `POST /api/foundry/deploy` `{account_id, region, resource_group?, foundry_name, deployment_name, model_name, model_version, sku_name?: "Standard", capacity?: 1}` → `{job_id}`
- `GET /api/foundry/resources?account_id=1` → 已有 Foundry 资源列表 `[{name, resource_group, location, sku}]`

## 初始化脚本

- `GET /api/scripts` → `[{id, name, description, content, created_at, updated_at}]`
- `POST /api/scripts` `{name, description?, content}` → 创建
- `PUT /api/scripts/{id}` `{name?, description?, content?}` → 更新
- `DELETE /api/scripts/{id}` → 删除
- 说明：创建虚拟机时 `user_data` 可直接填脚本内容，或前端从脚本库选择后填入。

## 任务中心

- `GET /api/jobs` → `[Job]`（倒序，分页 `?limit=50`）
- `GET /api/jobs/{job_id}` → `Job`
- `DELETE /api/jobs/{job_id}` → 删除记录
- Job = `{id, type: "create_vm"|"vm_action"|"foundry_ensure"|"foundry_deploy", title, account_id?, status: "pending"|"running"|"success"|"failed", logs: [{time, level, message}], result?: object, created_at, finished_at?}`

## API 访问（个人 Token）

- `GET /api/tokens` → `[{id, name, prefix, created_at, last_used_at?}]`
- `POST /api/tokens` `{name}` → `{id, name, token}`（token 只返回一次）
- `DELETE /api/tokens/{id}` → 撤销
- 说明：Token 以 `Bearer` 方式调用所有 `/api/*` 接口，与 JWT 等效。

## API 文档

- 前端内嵌展示 `GET /api/docs`（Swagger UI），后端 FastAPI 自带 `/api/docs` 与 `/api/openapi.json`。

## 约定

- 所有 `account_id` 为整数；单账号场景前端默认选中第一个。
- 长耗时操作（建 VM、VM 动作、Foundry）一律返回 `{job_id}`，前端轮询 `GET /api/jobs/{job_id}`。
- Azure 相关错误后端转换为 400 + 中文 `detail`。
