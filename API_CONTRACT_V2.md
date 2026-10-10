# Azure Panel API 契约 v2（对标 Azure，单用户版）

Base URL: `/api/v1`，除登录外全部需要 `Authorization: Bearer <jwt>`。
时间格式 `YYYY-MM-DD HH:MM:S`。错误格式 `{"detail": "..."}`。

## 视觉规范（必须严格遵守）
- **浅色主题**：白底页面，白色卡片 + 细浅灰边框 + 圆角，间距宽松，内容居中限宽。
- 主色蓝色（主按钮/高亮/链接）；次要按钮灰/白描边；危险操作红色描边。
- 表格表头浅灰底；空状态居中图标 + 灰色文字。
- 顶栏：蓝色方块 Logo + "Azure"→改为"Azure面板"？不——品牌用 **"Azure面板"** + 副标题 "Cloud control plane"；搜索框占位"搜索当前页内容...（⌘K)"；"简体中文"；深色切换；圆形头像按钮（用户名首字母）。
- 侧边栏分组：平台（总览、Azure 账号、代理、账单费用、资源配额）、资源管理（资源组、虚拟机、Foundry、初始化脚本）、运维中心（任务中心、API 访问、API 文档）。当前页高亮。底部 "© 2026 Azure Panel"。
- 页面头：面包屑 "Azure面板 / X"，下方灰色副标题（各页副标题见下）。

## 认证
- `POST /api/v1/auth/login` `{username, password}` → `{access_token, token_type}`
- `GET /api/v1/auth/me` → `{username}`
- `POST /api/v1/auth/change-password` `{old_password, new_password}`

## 总览 `GET /api/v1/overview`
副标题："查看账号、资源和任务的实时状态。"
→ `{accounts:{total,healthy,error}, resource_groups:{total}, vms:{running,stopped,total}, foundry:{total}, billing:{month_to_date,currency}, recent_jobs:[{id,type,title,account_id,status,created_at,finished_at}]}`
UI："资源概览" 4 卡（Azure 账号/资源组/虚拟机/Foundry，每卡图标+标题+大数字+两行彩色圆点状态）；"最近操作"卡（副标题"最近的 Azure 操作记录和处理状态。"，表格列：开始时间、操作、资源、操作人、状态，空"暂无任务"，底部"查看全部操作 →"）；下排两卡："配额使用情况"（右上"查看配额详情"链接，账号下拉+区域下拉eastasia，未选时"请选择一个已启用的 Azure 账号"）；"需要处理"卡（4 行：0 个 Azure 账号需要重新验证/0 个任务需要人工复核/0 个任务最近执行失败/0 个配额接近或达到限制，每行绿对勾+标题/描述+右箭头）。

## Azure 账号
副标题："管理服务主体凭据和请求代理。"
- `GET /api/v1/accounts?q=&status=all` → `{items:[{id,alias,subscription_id,subscription_name,quota_tier,status,status_msg,proxy_id,proxy_name,last_checked,created_at,updated_at}], total}`
- `POST /api/v1/accounts` `{alias,tenant_id,client_id,client_secret,subscription_id,proxy_id?}` → 创建（先轻量测连接）
- `PUT /api/v1/accounts/{id}` 同上（secret 留空不改）
- `DELETE /api/v1/accounts/{id}`
- `POST /api/v1/accounts/{id}/test` → `{ok, subscription_name, quota_tier}`
- `POST /api/v1/accounts/batch-refresh` → `[{id,alias,ok,error?}]`
- `POST /api/v1/accounts/batch-delete` `{ids:[...]}` → `{ok, deleted}`
- `POST /api/v1/accounts/batch-import` `{accounts:[AccountIn]}` → `[{alias,ok,id?,error?}]`
UI：右上"批量刷新状态"（灰描边）、"批量导入账户"（灰描边）、"+ 添加 Azure 账号"（蓝）；"账号列表"卡（副标题"管理已接入的 Azure 账号、订阅状态和请求代理。"）；过滤：搜索"搜索账户名称或订阅 ID"+下拉"全部状态"；选择行复选框+"全选当前列表"，右端红描边"批量删除"；表格列：名称、订阅、代理、订阅状态、最后检测、操作；空"还没有 Azure 账号"；底部"显示 X / Y 项"。

## 代理
副标题："维护全局和私有 HTTP、HTTPS、SOCKS5 代理。"
- `GET /api/v1/proxies?q=` → `[{id,name,protocol,host,port,username,password_set,is_default,bound_accounts,created_at}]`
- `POST /api/v1/proxies` `{name,protocol,host,port,username?,password?,is_default?}`
- `PUT /api/v1/proxies/{id}` 同上
- `DELETE /api/v1/proxies/{id}`（被账号引用时 400）
- `POST /api/v1/proxies/{id}/test` → `{ok, message}`
UI：右上"刷新全部状态"（无数据时禁用+提示）、"批量添加"（灰）、"+ 添加代理"（蓝）；"代理列表"卡（副标题"已被 Azure 账号引用的代理不能删除。"）；过滤：搜索"搜索代理名称或地址"+下拉"全部状态"；表格列：名称、类型、状态、绑定账户、操作（测试/编辑/删除）；空"暂无代理"。

## 账单费用
副标题："分析订阅费用、趋势和资源分布。"
- `GET /api/v1/billing/range?account_id&start=YYYY-MM-DD&end=YYYY-MM-DD&group_by=none|resource_group&cost_type=actual` → `{total,currency,daily:[{date,cost}],details:[{resource_group,cost}]}`（50 秒超时保护）
- `GET /api/v1/billing?account_id=` → 本月 MTD（旧接口保留）
- `GET /api/v1/billing/summary` → 汇总
UI：过滤卡：Azure 账号下拉、开始日期、结束日期、分组下拉（资源组）、费用类型下拉（实际费用）、蓝色"查询费用"；"区间总费用"卡（副标题"Azure Cost Management 返回的税前费用合计。"，大数字+"Azure 结算币种"）；"每日趋势"卡（副标题"同一天的各分组汇总后绘制。"，纯 CSS 折线/柱状，空"暂无数据"）；"费用明细"卡（副标题"列由 Cost Management 动态返回。"，表格：资源组、费用）。

## 资源配额
副标题："查看订阅区域、计算资源与 Foundry 模型配额。"
- `GET /api/v1/quotas?account_id=` → `{account_id,account_alias,quota_tier,cognitiveservices?,vm_quotas:[{region,usages:[{name,current,limit}]}],error?}`
UI：过滤卡：Azure 账号下拉、区域下拉、蓝色"查询配额"；浅蓝提示卡（3 段文字照抄契约 v1 的提示语）；"计算 / VM 配额"区（副标题"当前订阅在所选区域的 vCPU、机型系列和其他 Microsoft.Compute 使用量与上限。"，开关"显示零额度项目"+搜索"搜索配额或模型"+徽章"配额行: N"，表格列：配额项目、已使用、上限、剩余、使用率、作用域/状态，空"没有匹配的配额数据"）；浅蓝卡"Azure OpenAI 配额层级"（说明文字）；"Foundry 区域模型配额"区（同表结构）；"Foundry 账号配额"区（Foundry 账号下拉）。

## 资源组
副标题："创建、查看和删除 Azure 资源组。"
- `GET /api/v1/resource-groups?account_id=` → `[{name,location,tags,vm_count}]`
UI：过滤行：Azure 账号下拉（"全部账户"）、区域下拉（"全部地区"）、右端灰色"刷新"、蓝色"+ 创建资源组"；"订阅资源组"卡（副标题"删除资源组会删除其中全部 Azure 资源，请核对确认。"）；空"此订阅暂无资源组"。（创建/删除资源组后端暂未实现，按钮可禁用并提示"即将上线"）

## 虚拟机
副标题："管理机器生命周期、网络和初始化脚本。"
- `GET /api/v1/vms?account_id=` → `{alias, vms:[{id,name,location,vm_size,status,resource_group,public_ip,ip_allocation_method,disk_size,time_created}]}`
- `GET /api/v1/vms/meta?account_id=&region=` → `{regions:[{code,name_cn}], vm_sizes, os_images, ip_permission}`
- `POST /api/v1/vms` `{account_id,region,vm_size,os_image?,os_image_data?,disk_size_gb?,disk_type?,ip_type?,vm_name?,username?,password?,ssh_key?,user_data?,dd_system?}` → `{job_id}`
- `POST /api/v1/vms/action` `{account_id,resource_group,vm_name,action:start|stop|restart|delete|change_ip}` → `{job_id}`
UI：过滤行：Azure 账号下拉（"全部账户"）、区域下拉（"全部地区"）、灰色"刷新"、蓝色"+ 创建虚拟机"；"虚拟机"卡（副标题"启动可附带 sh/PowerShell 脚本。更换 IP 会先绑定新地址，再清理 Azure 管理的旧地址。"→把 Azure 改为"面板"）；表格列：名称、状态、配置、公网 IP、资源组、位置、操作（启动/关机/重启/更换 IP/删除）；空"暂无可访问的虚拟机"。创建弹窗字段：区域（中文名）、规格、镜像、磁盘大小/类型、IP 类型、VM 名、用户名、密码、SSH Key、初始化脚本（从脚本模板选择填入 user_data）、DD 重装开关。

## Foundry
副标题："管理账号、项目、部署和访问密钥。"
- `GET /api/v1/foundry/regions?account_id=` → `{regions}`
- `GET /api/v1/foundry/models?account_id=` → 模型列表
- `GET /api/v1/foundry/resources?account_id=` → `[{name,resource_group,location,sku,kind}]`
- `POST /api/v1/foundry/ensure` `{account_id,region,resource_group?}` → `{job_id}`
- `POST /api/v1/foundry/deploy` `{account_id,region,resource_group?,foundry_name,deployment_name,model_name,model_version,sku_name?,capacity?}` → `{job_id}`
UI：过滤行：Azure 账号下拉（"全部账户"）、Foundry 账号下拉（"全部账户"）、灰色"刷新"、蓝色"+ 创建 Foundry 账号"、蓝色"+ 批量部署模型"；表格列：Azure 账号、订阅、配额层级、订阅状态、操作（部署模型）；另加页签或区块展示模型列表与部署任务。（"升级可用状态/下一层级可用时间"等 Azure 特有字段无数据源，省略）

## 初始化脚本
副标题："维护 Linux cloud-init 和 Windows PowerShell 模板。"
- `GET /api/v1/scripts` → `[{id,name,description,content,created_at,updated_at}]`
- `POST /api/v1/scripts` `{name,description?,content}`
- `PUT /api/v1/scripts/{id}` / `DELETE /api/v1/scripts/{id}`
UI：右上蓝色"+ 新建模板"；"脚本模板"卡（副标题"创建虚拟机时可选择模板或提交一次性脚本。"）；表格列：名称、描述、更新时间、操作（编辑/删除）；空"暂无脚本模板"。

## 任务中心
副标题："跟踪 Azure 长操作、重试和待确认任务。"
- `GET /api/v1/jobs?limit=50` → `[{id,type,title,account_id,status,attempts,created_at,updated_at,finished_at}]`
- `GET /api/v1/jobs/{id}` → 含 `logs:[{time,level,message}]` 和 `result`
- `DELETE /api/v1/jobs/{id}`
UI："任务"卡（副标题"页面每 5 秒刷新，可在此跟踪 Azure 操作进度和处理结果。"）；右上"只看待核查"（描边，过滤 status=failed）、灰色"刷新"；表格列：开始时间、操作、ID、状态、尝试次数、更新时间、操作（查看日志/删除）；空"暂无任务"；详情弹窗日志每 3 秒轮询。

## API 访问
副标题："管理个人访问令牌并连接自动化工具。"
- `GET /api/v1/tokens` → `[{id,name,prefix,created_at,last_used_at}]`
- `POST /api/v1/tokens` `{name}` → `{id,name,token}`（明文只一次）
- `DELETE /api/v1/tokens/{id}`
UI："API 地址"卡：灰色代码框 `https://azure.sijuly.uk/api/v1`，副标题"使用 Bearer Token 获取 OpenAPI JSON，可以交给 AI 了解接口。"；"个人 API Token"卡（副标题"Token 拥有你当前的全部权限，长期有效。"），"生成 Token"蓝色按钮，表格列：名称、前缀、创建时间、最后使用、操作（撤销）。

## API 文档
副标题："当前角色可访问的接口、参数与调用示例。"
UI：顶部"OpenAPI 3.2.0"徽章 + 右上"下载 OpenAPI JSON"（链接 `/api/v1/openapi.json`）、"下载 Postman Collection"（可省略或前端生成）；信息横幅；左列搜索"搜索接口名称、路径或说明…" + 分组列表（认证与 Token、Azure 账号、费用、Foundry、配额、资源组、虚拟机、任务、代理、脚本、平台）；右列：直接 iframe 嵌入 `/api/v1/docs`（Swagger UI）即可。

## 通用约定
- 长耗时操作返回 `{job_id}`，前端提示去任务中心查看并提供跳转。
- 所有请求 401 时跳登录页。
- 空状态统一：居中图标 + 灰色文字。
- 不要深色主题！Azure 是浅色主题。
