import logging
import time
import uuid
import requests
from datetime import date
from typing import List, Dict, Any, Optional

try:
    from azure.identity import ClientSecretCredential
    from azure.mgmt.compute import ComputeManagementClient
    from azure.mgmt.network import NetworkManagementClient

    try:
        from azure.mgmt.resource import ResourceManagementClient
    except ImportError:
        # Fallback for newer azure-mgmt-resource versions
        from azure.mgmt.resource.resources import ResourceManagementClient

    from azure.core.exceptions import (
        ClientAuthenticationError,
        ResourceNotFoundError,
        HttpResponseError,
    )
except ImportError as e:
    logging.error(f"Azure SDK import error: {e}. Please run: pip install azure-identity azure-mgmt-compute azure-mgmt-network azure-mgmt-resource")

    class _AzureSDKMissing(Exception):
        pass

    for _name in ("ClientAuthenticationError", "ResourceNotFoundError", "HttpResponseError"):
        globals().setdefault(_name, _AzureSDKMissing)

AZURE_REGIONS_CN = {
    "eastus": "美国东部",
    "eastus2": "美国东部 2",
    "westus": "美国西部",
    "westus2": "美国西部 2",
    "westus3": "美国西部 3",
    "centralus": "美国中部",
    "northcentralus": "美国中北部",
    "southcentralus": "美国中南部",
    "westcentralus": "美国中西部",
    "northeurope": "北欧",
    "westeurope": "西欧",
    "eastasia": "东亚 (香港)",
    "southeastasia": "东南亚 (新加坡)",
    "japaneast": "日本东部 (东京)",
    "japanwest": "日本西部 (大阪)",
    "koreacentral": "韩国中部 (首尔)",
    "koreasouth": "韩国南部 (釜山)",
    "australiaeast": "澳大利亚东部",
    "australiasoutheast": "澳大利亚东南部",
    "australiacentral": "澳大利亚中部",
    "switzerlandnorth": "瑞士北部",
    "uksouth": "英国南部",
    "ukwest": "英国西部",
    "francecentral": "法国中部",
    "germanywestcentral": "德国中西部",
    "norwayeast": "挪威东部",
    "swedencentral": "瑞典中部",
    "brazilsouth": "巴西南部",
    "southafricanorth": "南非北部",
    "uaenorth": "阿联酋北部",
    "canadacentral": "加拿大中部",
    "canadaeast": "加拿大东部",
    "centralindia": "印度中部",
    "southindia": "印度南部",
    "westindia": "印度西部",
    "australiacentral2": "澳大利亚中部 2",
    "austriaeast": "奥地利东部",
    "belgiumcentral": "比利时中部",
    "brazilsoutheast": "巴西东南部",
    "centraluseuap": "美国中部 (EUAP)",
    "chilecentral": "智利中部",
    "denmarkeast": "丹麦东部",
    "eastus2euap": "美国东部 2 (EUAP)",
    "eastusstg": "美国东部 (STG)",
    "francesouth": "法国南部",
    "germanynorth": "德国北部",
    "indiasouthcentral": "印度中南部",
    "indonesiacentral": "印度尼西亚中部",
    "israelcentral": "以色列中部",
    "italynorth": "意大利北部",
    "jioindiacentral": "Jio 印度中部",
    "jioindiawest": "Jio 印度西部",
    "malaysiawest": "马来西亚西部",
    "mexicocentral": "墨西哥中部",
    "newzealandnorth": "新西兰北部",
    "norwaywest": "挪威西部",
    "polandcentral": "波兰中部",
    "qatarcentral": "卡塔尔中部",
    "southafricawest": "南非西部",
    "southcentralusstg": "美国中南部 (STG)",
    "spaincentral": "西班牙中部",
    "switzerlandwest": "瑞士西部",
    "uaecentral": "阿联酋中部"
}

# Microsoft Foundry 资源当前在 ARM 中以 Microsoft.CognitiveServices/accounts 创建，
# kind 为 AIServices。区域支持会随 Azure 侧变化，这里只作为首选候选集；实际创建时
# 仍以 ARM 返回结果为准。
AZURE_FOUNDRY_PREFERRED_REGIONS = {
    "australiaeast", "brazilsouth", "canadacentral", "centralindia",
    "centralus", "eastasia", "eastus", "eastus2", "francecentral",
    "germanywestcentral", "italynorth", "japaneast", "koreacentral",
    "northcentralus", "northeurope", "norwayeast", "polandcentral",
    "southafricanorth", "southcentralus", "southeastasia", "southindia",
    "spaincentral", "swedencentral", "switzerlandnorth", "uaenorth",
    "uksouth", "westeurope", "westus", "westus3"
}

# 用于 UI 展示的优先顺序：能创建 Foundry 资源并不代表该区域支持目标模型部署。
# eastasia 可创建资源，但经常不支持 gpt-4o/gpt-4o-mini Standard 部署，因此放到靠后位置。
AZURE_FOUNDRY_REGION_PRIORITY = [
    "eastus", "eastus2", "swedencentral", "westus3", "westus",
    "francecentral", "australiaeast", "japaneast", "canadacentral",
    "uksouth", "westeurope", "northeurope", "southcentralus",
    "centralus", "northcentralus", "southeastasia", "eastasia"
]


def _azure_region_code(region_text: str) -> str:
    """从 "中文名 (eastus)" 或 "eastus" 中提取 Azure location code。"""
    import re
    text = (region_text or "").strip()
    match = re.search(r"\(([^()]+)\)\s*$", text)
    return (match.group(1) if match else text).strip().lower().replace(" ", "")

# ---- Cost Management 查询的限流重试参数 ----
_COST_MAX_ATTEMPTS = 5
_COST_RETRY_BASE_WAIT = 8.0
_COST_RETRY_MAX_WAIT = 90.0


def _cost_retry_wait(response, attempt: int) -> float:
    if response is not None:
        try:
            headers = {str(k).lower(): v for k, v in dict(response.headers).items()}
        except (AttributeError, TypeError, ValueError):
            headers = {}
        server_wait = 0.0
        for name, raw in headers.items():
            if not name.endswith("retry-after") or not raw:
                continue
            try:
                wait = float(str(raw).strip())
            except (TypeError, ValueError):
                continue
            if wait > server_wait:
                server_wait = wait
        if server_wait > 0:
            return min(server_wait + 1.0, _COST_RETRY_MAX_WAIT)
    return min(_COST_RETRY_BASE_WAIT * (2 ** attempt), _COST_RETRY_MAX_WAIT)


def _cost_retry_sleep(seconds: float, stop_event) -> bool:
    if stop_event is not None:
        return not stop_event.wait(seconds)
    time.sleep(seconds)
    return True


class AzureManager:
    """处理与 Azure 云交互的核心逻辑"""
    def __init__(self):
        self.is_connected = False
        self.connected_alias = None
        self.credential = None
        self.subscription_id = None
        self.tenant_id = None
        self.client_id = None
        self.client_secret = None
        
        self.compute_client: Optional[ComputeManagementClient] = None
        self.network_client: Optional[NetworkManagementClient] = None
        self.resource_client: Optional[ResourceManagementClient] = None

    def connect(self, profile_data: dict, alias: str):
        """连接到 Azure"""
        try:
            self._cached_regions = None
            
            self.tenant_id = profile_data.get('tenant_id')
            self.client_id = profile_data.get('client_id')
            self.client_secret = profile_data.get('client_secret')
            self.subscription_id = profile_data.get('subscription_id')

            if not all([self.tenant_id, self.client_id, self.client_secret, self.subscription_id]):
                raise ValueError("凭据不完整，必须包含 tenant_id, client_id, client_secret 和 subscription_id")

            self.credential = ClientSecretCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,
                client_secret=self.client_secret
            )

            self.compute_client = ComputeManagementClient(self.credential, self.subscription_id)
            self.network_client = NetworkManagementClient(self.credential, self.subscription_id)
            self.resource_client = ResourceManagementClient(self.credential, self.subscription_id)
            
            try:
                self.resource_client.providers.register('Microsoft.Network')
                self.resource_client.providers.register('Microsoft.Compute')
                self.resource_client.providers.register('Microsoft.CostManagement')
            except Exception as e:
                logging.warning(f"自动注册 Resource Providers 失败: {e}")
                
            subscription_name = ""
            try:
                access_token = self.credential.get_token("https://management.azure.com/.default").token
                headers = {"Authorization": f"Bearer {access_token}"}
                url = f"https://management.azure.com/subscriptions/{self.subscription_id}?api-version=2020-01-01"
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    sub_data = resp.json()
                    subscription_name = sub_data.get('displayName', '')
                else:
                    logging.warning(f"获取订阅名称失败: HTTP {resp.status_code} - {resp.text}")
            except Exception as e:
                logging.warning(f"无法获取订阅名称: {e}")

            # --- 新增：获取付费层级 ---
            quota_tier = ""
            try:
                ok_tier, tier_data, _ = self.get_quota_tier(self.credential, self.subscription_id)
                if ok_tier and tier_data:
                    quota_tier = tier_data.get("quota_tier", "")
            except Exception as e:
                logging.warning(f"获取付费层级失败: {e}")

            list(self.compute_client.virtual_machines.list_all())

            self.is_connected = True
            self.connected_alias = alias
            
            result_data = {}
            if subscription_name:
                result_data["subscription_name"] = subscription_name
            if quota_tier:
                result_data["quota_tier"] = quota_tier
                
            return True, (result_data if result_data else None), "连接成功"
        except Exception as e:
            self.is_connected = False
            self.connected_alias = None
            logging.error(f"Azure 连接失败: {e}")
            return False, None, f"连接失败: {str(e)}"

    def get_quota_tier(self, credential=None, subscription_id=None, log_callback=None) -> tuple:
        """查询订阅的 Foundry 模型配额层级 (Free Tier / Tier 1~6) 及升级资格。

        调用的 Quota Tiers API (2025-10-01-preview) 返回结构：
          properties.currentTierName            当前层级
          properties.tierUpgradePolicy          升级策略 (OnceUpgradeIsAvailable / NoAutoUpgrade)
          properties.assignmentDate             当前层级分配日期
          properties.tierUpgradeEligibilityInfo.nextTierName
          properties.tierUpgradeEligibilityInfo.upgradeAvailabilityStatus  (Eligible / Ineligible)
          properties.tierUpgradeEligibilityInfo.upgradeApplicableDate      下一层级可用时间
          properties.tierUpgradeEligibilityInfo.upgradeUnavailabilityReason 不符合升级的原因
        """
        import re

        def _log(msg, level="INFO"):
            if log_callback:
                log_callback(msg, level)

        def _normalize_tier_name(name):
            name = (name or "").strip()
            m = re.fullmatch(r"(?i)tier\s*(\d+)", name)
            if m:
                return f"Tier {m.group(1)}"
            if re.fullmatch(r"(?i)free(\s*tier)?", name):
                return "Free Tier"
            return name

        if credential is None:
            credential = self.credential
        if subscription_id is None:
            subscription_id = self.subscription_id
        if not credential or not subscription_id:
            return True, {"quota_tier": ""}, ""

        try:
            _log("正在查询账号付费层级...")
            access_token = credential.get_token("https://management.azure.com/.default").token
            headers = {"Authorization": f"Bearer {access_token}"}
            url = (
                f"https://management.azure.com/subscriptions/{subscription_id}"
                f"/providers/Microsoft.CognitiveServices/quotaTiers?api-version=2025-10-01-preview"
            )
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                value_list = data.get("value") or []
                props = {}
                if value_list and isinstance(value_list[0], dict):
                    props = value_list[0].get("properties") or {}
                tier_name = props.get("currentTierName")
                if tier_name is None:
                    for v in props.values():
                        if v and re.fullmatch(r"(?i)(free(\s*tier)?|tier\s*\d+)", str(v).strip()):
                            tier_name = v
                            break
                # 升级资格信息嵌套在 tierUpgradeEligibilityInfo 对象里，不是 properties 顶层
                elig = props.get("tierUpgradeEligibilityInfo") or {}
                if not isinstance(elig, dict):
                    elig = {}
                if tier_name:
                    _log(f"付费层级查询完成: {tier_name}")
                    result_data = {
                        "quota_tier": _normalize_tier_name(str(tier_name)),
                        "next_tier_name": _normalize_tier_name(str(elig.get("nextTierName") or "")),
                        "upgrade_available": elig.get("upgradeAvailabilityStatus") or props.get("upgradeAvailabilityStatus") or "",
                        "upgrade_applicable_date": elig.get("upgradeApplicableDate") or "",
                        "upgrade_unavailability_reason": elig.get("upgradeUnavailabilityReason") or "",
                        "tier_upgrade_policy": props.get("tierUpgradePolicy") or "",
                        "assignment_date": props.get("assignmentDate") or "",
                    }
                    return True, result_data, ""
                _log("付费层级查询完成: 未识别到层级信息", "WARN")
                return True, {"quota_tier": "未知"}, ""
            if resp.status_code == 404:
                _log("该账号不支持付费层级查询 (Not Found)")
                return True, {"quota_tier": "不支持"}, ""
            logging.warning(f"查询付费层级失败: HTTP {resp.status_code} - {resp.text[:200]}")
            _log(f"付费层级查询失败: HTTP {resp.status_code}", "WARN")
            return True, {"quota_tier": "未知"}, ""
        except Exception as e:
            logging.warning(f"查询付费层级异常: {e}")
            _log(f"付费层级查询异常: {e}", "WARN")
            return True, {"quota_tier": "未知"}, ""

    def get_month_to_date_cost(self, expiration_date=None, alias=None, credential=None, subscription_id=None, cached_history_cost=None, cached_acc_cost=None, log_callback=None, stop_event=None) -> tuple:
        """获取当月产生费用和累计费用"""
        if credential is None: credential = self.credential
        if subscription_id is None: subscription_id = self.subscription_id
        if alias is None: alias = self.connected_alias
        
        if not credential or not subscription_id:
            return True, {"alias": alias, "mtd": "0.00", "acc": "0.00", "history": "0.00", "currency": ""}, ""
        
        time.sleep(3)

        mtd_cost = "未获取"
        accumulated_cost = "未获取"
            
        try:
            access_token = credential.get_token("https://management.azure.com/.default").token
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            
            url = f"https://management.azure.com/subscriptions/{subscription_id}/providers/Microsoft.CostManagement/query?api-version=2023-11-01"
            payload_mtd = {
                "type": "Usage",
                "timeframe": "MonthToDate",
                "dataset": {
                    "granularity": "None",
                    "aggregation": {
                        "totalCost": {
                            "name": "PreTaxCost",
                            "function": "Sum"
                        }
                    }
                }
            }
            currency_str = ""

            if log_callback:
                log_callback("正在查询本月消耗金额...")

            last_err_msg = ""
            for attempt in range(_COST_MAX_ATTEMPTS):
                if stop_event and stop_event.is_set():
                    return False, {}, "操作被取消"
                try:
                    response = requests.post(url, headers=headers, json=payload_mtd, timeout=15)
                    if response.status_code == 200:
                        data = response.json()
                        if 'properties' in data and 'rows' in data['properties']:
                            rows = data['properties']['rows']
                            if rows and len(rows) > 0 and len(rows[0]) > 0:
                                mtd_cost = f"{float(rows[0][0]):.2f}"
                                cols = data['properties'].get('columns', [])
                                for idx, col in enumerate(cols):
                                    if col.get('name') == 'Currency' and idx < len(rows[0]):
                                        currency_str = str(rows[0][idx])
                                        break
                            else:
                                mtd_cost = "0.00"
                        else:
                            mtd_cost = "0.00"

                        if log_callback:
                            log_callback(f"本月消耗查询完成: {mtd_cost}")
                        break
                    elif response.status_code in [429, 500, 502, 503, 504]:
                        last_err_msg = f"HTTP {response.status_code} 限流或服务器异常"
                        if attempt == _COST_MAX_ATTEMPTS - 1:
                            if log_callback:
                                log_callback(f"本月消耗查询异常结束: 多次重试失败 ({last_err_msg})")
                            break
                        wait_time = _cost_retry_wait(response, attempt)
                        if not _cost_retry_sleep(wait_time, stop_event):
                            return False, {}, "操作被取消"
                    else:
                        if response.status_code in [400, 404]:
                            err_msg = response.text.lower() if response.text else ""
                            if "not supported" in err_msg:
                                mtd_cost = "赞助订阅请去官网查看"
                            else:
                                mtd_cost = "0.00"
                        elif response.status_code in [401, 403]:
                            mtd_cost = "无权限(可能为赞助/学生订阅)"
                        else:
                            mtd_cost = f"错误 HTTP {response.status_code}"
                        
                        if log_callback:
                            log_callback(f"本月消耗查询异常结束: {mtd_cost}")
                        break
                except Exception as e:
                    last_err_msg = str(e)
                    if attempt == _COST_MAX_ATTEMPTS - 1:
                        logging.warning(f"获取本月成本异常: {e}")
                        if log_callback:
                            log_callback(f"本月消耗查询异常结束: 网络或代码错误 ({last_err_msg})")
                        break
                    if not _cost_retry_sleep(_cost_retry_wait(None, attempt), stop_event):
                        return False, {}, "操作被取消"

            base_acc_cost = 0.0
            api_acc_fetched = False
            history_cost_val = 0.0
            used_cache = False

            if cached_history_cost is not None and mtd_cost not in ["未获取", "赞助订阅请去官网查看", "无权限(可能为赞助/学生订阅)"] and not mtd_cost.startswith("错误"):
                try:
                    history_cost_val = float(cached_history_cost)
                    base_acc_cost = float(mtd_cost) + history_cost_val
                    
                    if cached_acc_cost is not None and cached_acc_cost != "未获取" and cached_acc_cost != "Error":
                        try:
                            if base_acc_cost < float(cached_acc_cost):
                                base_acc_cost = float(cached_acc_cost)
                                history_cost_val = base_acc_cost - float(mtd_cost)
                                if history_cost_val < 0:
                                    history_cost_val = 0.0
                        except (TypeError, ValueError): pass  
                        
                    api_acc_fetched = True
                    used_cache = True
                    if log_callback:
                        log_callback(f"使用本地缓存历史消耗跳过 API 查询。")
                except Exception as e:
                    used_cache = False

            if not used_cache and expiration_date and expiration_date != "Azure":
                try:
                    import datetime
                    dt = datetime.datetime.strptime(expiration_date, "%Y-%m-%d")
                    start_date = dt.replace(year=dt.year - 1)
                    today = datetime.datetime.utcnow()
                    
                    from_str = start_date.strftime("%Y-%m-%dT00:00:00Z")
                    to_str = today.strftime("%Y-%m-%dT23:59:59Z")
                    
                    if log_callback:
                        log_callback(f"正在按到期日查询近一年累计（{start_date.strftime('%Y-%m-%d')} 至 {today.strftime('%Y-%m-%d')}）...")
                    
                    payload_acc = {
                        "type": "Usage",
                        "timeframe": "Custom",
                        "timePeriod": {
                            "from": from_str,
                            "to": to_str
                        },
                        "dataset": {
                            "granularity": "None",
                            "aggregation": {
                                "totalCost": {
                                    "name": "PreTaxCost",
                                    "function": "Sum"
                                }
                            }
                        }
                    }
                    last_acc_err = ""
                    for attempt in range(_COST_MAX_ATTEMPTS):
                        if stop_event and stop_event.is_set():
                            return False, {}, "操作被取消"
                        try:
                            resp_acc = requests.post(url, headers=headers, json=payload_acc, timeout=15)
                            if resp_acc.status_code == 200:
                                data_acc = resp_acc.json()
                                if 'properties' in data_acc and 'rows' in data_acc['properties']:
                                    rows_acc = data_acc['properties']['rows']
                                    if rows_acc and len(rows_acc) > 0 and len(rows_acc[0]) > 0:
                                        base_acc_cost = float(rows_acc[0][0])
                                        if cached_acc_cost is not None and cached_acc_cost != "未获取" and cached_acc_cost != "Error":
                                            try:
                                                if base_acc_cost < float(cached_acc_cost):
                                                    base_acc_cost = float(cached_acc_cost)
                                            except (TypeError, ValueError):
                                                pass 
                                        if not currency_str:
                                            cols = data_acc['properties'].get('columns', [])
                                            for idx, col in enumerate(cols):
                                                if col.get('name') == 'Currency' and idx < len(rows_acc[0]):
                                                    currency_str = str(rows_acc[0][idx])
                                                    break
                                api_acc_fetched = True
                                if log_callback:
                                    log_callback(f"近一年累计查询完成: {base_acc_cost:.2f}")
                                break
                            elif resp_acc.status_code in [429, 500, 502, 503, 504]:
                                last_acc_err = f"HTTP {resp_acc.status_code}"
                                if attempt == _COST_MAX_ATTEMPTS - 1:
                                    if log_callback:
                                        log_callback(f"获取累计成本异常结束: 多次重试失败 ({last_acc_err})")
                                    break
                                wait_time = _cost_retry_wait(resp_acc, attempt)
                                if not _cost_retry_sleep(wait_time, stop_event):
                                    return False, {}, "操作被取消"
                            else:
                                if resp_acc.status_code in [400, 404]:
                                    err_msg_acc = resp_acc.text.lower() if resp_acc.text else ""
                                    if "not supported" in err_msg_acc:
                                        pass
                                    else:
                                        base_acc_cost = 0.0
                                    api_acc_fetched = True
                                elif resp_acc.status_code in [401, 403]:
                                    base_acc_cost = 0.0
                                    api_acc_fetched = True
                                break
                        except Exception as e:
                            last_acc_err = str(e)
                            if attempt == _COST_MAX_ATTEMPTS - 1:
                                logging.warning(f"获取累计成本异常: {e}")
                                if log_callback:
                                    log_callback(f"获取累计成本异常结束: ({last_acc_err})")
                                break
                            if not _cost_retry_sleep(_cost_retry_wait(None, attempt), stop_event):
                                return False, {}, "操作被取消"
                except Exception as e:
                    logging.warning(f"获取累计成本失败: {e}")

            if mtd_cost not in ["未获取", "赞助订阅请去官网查看", "无权限(可能为赞助/学生订阅)"] and not mtd_cost.startswith("错误"):
                try:
                    mtd_val = float(mtd_cost)
                    if base_acc_cost < mtd_val:
                        base_acc_cost = mtd_val
                except (TypeError, ValueError):
                    pass
                    
            if cached_acc_cost is not None and cached_acc_cost != "未获取" and cached_acc_cost != "Error":
                try:
                    if base_acc_cost < float(cached_acc_cost):
                        base_acc_cost = float(cached_acc_cost)
                except (TypeError, ValueError):
                    pass  

            history_cost_str = "未获取"
            if mtd_cost in ["无权限(可能为赞助/学生订阅)", "赞助订阅请去官网查看"] or mtd_cost.startswith("错误"):
                accumulated_cost = mtd_cost
                history_cost_str = "0.00"
            else:
                accumulated_cost = f"{base_acc_cost:.2f}" if (api_acc_fetched or mtd_cost != "未获取") else "未获取"
                if accumulated_cost != "未获取" and mtd_cost != "未获取":
                    try:
                        history_val = base_acc_cost - float(mtd_cost)
                        if history_val < 0:
                            history_val = 0.0
                        history_cost_str = f"{history_val:.2f}"
                    except (TypeError, ValueError):
                        pass

            if log_callback:
                currency_display = f" {currency_str}" if currency_str else ""
                log_callback(f"消耗查询完成: 本月 {mtd_cost}{currency_display} / 累计 {accumulated_cost}{currency_display}")

            return True, {"alias": alias, "mtd": mtd_cost, "acc": accumulated_cost, "history": history_cost_str, "currency": currency_str}, ""
        except Exception as e:
            logging.error(f"获取成本失败: {e}")
            return False, {"alias": alias, "mtd": "Error", "acc": "Error", "history": "0.00", "currency": ""}, str(e)

    def _arm_headers(self) -> Dict[str, str]:
        if not self.credential:
            raise Exception("未连接到 Azure")
        access_token = self.credential.get_token("https://management.azure.com/.default").token
        return {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept-Language": "zh-CN"
        }

    def _arm_request(self, method: str, url: str, **kwargs):
        headers = kwargs.pop("headers", None) or self._arm_headers()
        resp = requests.request(method, url, headers=headers, timeout=kwargs.pop("timeout", 30), **kwargs)
        return resp

    def get_foundry_regions(self) -> tuple:
        """获取当前账号可尝试创建 Microsoft Foundry 资源的区域列表。"""
        if not self.is_connected:
            return False, [], "未连接到 Azure"
        try:
            regions = []
            for display in self.get_regions():
                code = _azure_region_code(display)
                if code in AZURE_FOUNDRY_PREFERRED_REGIONS:
                    regions.append({
                        "code": code,
                        "display": display,
                        "name": AZURE_REGIONS_CN.get(code, code)
                    })

            # 如果首选表和订阅可用区域没有交集，则退回全部订阅可用物理区域，避免
            # Azure 新增区域后被本地静态表挡住。
            if not regions:
                for display in self.get_regions():
                    code = _azure_region_code(display)
                    regions.append({"code": code, "display": display, "name": AZURE_REGIONS_CN.get(code, code)})

            priority = {code: idx for idx, code in enumerate(AZURE_FOUNDRY_REGION_PRIORITY)}
            regions.sort(key=lambda item: (priority.get(item.get("code"), 999), item.get("display", "")))
            return True, regions, ""
        except Exception as e:
            logging.error(f"获取 Foundry 区域失败: {e}")
            return False, [], str(e)

    def get_foundry_model_availability(self, foundry: Dict[str, Any]) -> tuple:
        """
        动态查询当前订阅在指定 Foundry 区域可部署的模型列表。

        使用 Azure ARM 官方接口：
        GET /subscriptions/{subscriptionId}/providers/Microsoft.CognitiveServices/locations/{location}/models

        为减少后台容量确认请求量，会在查询 modelCapacities 前先过滤为：
        - format=OpenAI 的官方常用模型族；
        - 模型版本日期在最近 12 个月内，或无日期版本但属于官方常用无日期版本格式的模型。

        返回 data 结构：
        {
            "region": "eastus",
            "deployable": bool,
            "models": [
                {"name": "gpt-4o-mini", "version": "2024-07-18", "format": "OpenAI", "sku": "Standard", ...}
            ],
            "message": "..."
        }
        """
        if not self.is_connected or not self.subscription_id:
            return False, {"deployable": False, "models": [], "message": "未连接到 Azure"}, "未连接到 Azure"
        if not isinstance(foundry, dict):
            return False, {"deployable": False, "models": [], "message": "未找到 Foundry 资源信息"}, "未找到 Foundry 资源信息"

        region_code = _azure_region_code(foundry.get("region", ""))
        if not region_code:
            return False, {"deployable": False, "models": [], "message": "Foundry 区域为空"}, "Foundry 区域为空"

        headers = self._arm_headers()
        url = (
            f"https://management.azure.com/subscriptions/{self.subscription_id}"
            f"/providers/Microsoft.CognitiveServices/locations/{region_code}/models?api-version=2024-10-01"
        )

        try:
            all_items = []
            next_url = url
            while next_url:
                resp = self._arm_request("GET", next_url, headers=headers, timeout=30)
                if resp.status_code != 200:
                    err_message = ""
                    err_code = ""
                    try:
                        err = resp.json().get("error") or {}
                        err_code = str(err.get("code") or "")
                        err_message = str(err.get("message") or "")
                    except Exception:
                        err_message = resp.text[:600]

                    if resp.status_code in (401, 403):
                        msg = (
                            f"Azure 接口拒绝查询 {region_code} 区域模型列表。"
                            "当前应用凭据可能缺少 Microsoft.CognitiveServices/models 读取权限，"
                            "或该订阅未开放 Azure AI Services / Azure OpenAI 模型能力。"
                        )
                    elif resp.status_code == 404:
                        msg = f"Azure 未返回 {region_code} 区域的模型列表，通常表示该区域不支持 Foundry/OpenAI 模型部署。"
                    else:
                        msg = f"查询 {region_code} 区域模型列表失败: HTTP {resp.status_code} {err_code} - {err_message}"
                    data = {"region": region_code, "deployable": False, "models": [], "message": msg}
                    return True, data, msg

                payload = resp.json() if resp.text else {}
                all_items.extend(payload.get("value") or [])
                next_url = payload.get("nextLink")

            model_candidates = []
            seen_candidates = set()

            def normalize_deployment_sku(value):
                """把 Azure 接口里可能出现的资源 SKU 规范化为部署 SKU。"""
                raw = str(value or "").strip()
                if not raw:
                    return "Standard"
                # S0/F0 是 Cognitive Services account 的 SKU，不是 deployments/{name} 支持的 SKU。
                if raw.upper() in {"S0", "F0"}:
                    return "Standard"
                return raw

            def version_date(value):
                """解析 Azure OpenAI 模型常见 YYYY-MM-DD 版本号；无法解析则返回 None。"""
                raw = str(value or "").strip()
                if len(raw) < 10:
                    return None
                try:
                    year = int(raw[0:4])
                    month = int(raw[5:7])
                    day = int(raw[8:10])
                    return date(year, month, day)
                except Exception:
                    return None

            def model_name_sort_key(model_name):
                """
                按模型名称本身的代际排序，避免硬编码旧模型优先级导致新模型被挤到后面。

                例如：gpt-6 > gpt-5.6 > gpt-5.5 > gpt-5 > gpt-4.1；
                同代模型（mini/chat/codex/nano 等）再按名称稳定排序。
                """
                import re

                name = str(model_name or "").strip().lower()
                match = re.match(r"^gpt-(\d+(?:\.\d+)*)", name)
                if match:
                    parts = []
                    for part in match.group(1).split("."):
                        try:
                            parts.append(int(part))
                        except ValueError:
                            parts.append(0)
                    while len(parts) < 4:
                        parts.append(0)
                    return (0, tuple(-part for part in parts[:4]), name)

                match = re.match(r"^o(\d+(?:\.\d+)*)", name)
                if match:
                    parts = []
                    for part in match.group(1).split("."):
                        try:
                            parts.append(int(part))
                        except ValueError:
                            parts.append(0)
                    while len(parts) < 4:
                        parts.append(0)
                    return (1, tuple(-part for part in parts[:4]), name)

                if name.startswith("text-embedding"):
                    return (8, (0, 0, 0, 0), name)
                return (9, (0, 0, 0, 0), name)

            def inferred_min_capacity(model_name, sku_name):
                """Azure 部分新模型不会在 modelCapacities 中稳定返回 minimumCapacity，这里补充已知最小容量。"""
                normalized_model = str(model_name or "").strip().lower()
                normalized_sku = str(sku_name or "").strip().lower()
                if normalized_model.startswith("gpt-5"):
                    return 15
                if "provisioned" in normalized_sku:
                    return 15
                return 1

            def add_months(base_date, months):
                month_index = base_date.month - 1 + months
                year = base_date.year + month_index // 12
                month = month_index % 12 + 1
                days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
                day = min(base_date.day, days_in_month[month - 1])
                return date(year, month, day)

            model_filter_months = 12
            cutoff_date = add_months(date.today(), -model_filter_months)
            official_prefixes = (
                "gpt-", "o1", "o3", "o4", "text-embedding-", "computer-use-",
                "dall-e-", "whisper", "tts", "babbage", "davinci",
            )

            def is_recent_official_openai_model(name, version):
                normalized_name = str(name or "").strip().lower()
                normalized_version = str(version or "").strip().lower()
                if not normalized_name.startswith(official_prefixes):
                    return False

                parsed_date = version_date(normalized_version)
                if parsed_date is not None:
                    return parsed_date >= cutoff_date

                # Azure 部分官方模型版本不是日期，例如 embedding 的 "1"。
                # 非日期版本只保留官方常用稳定模型族，避免第三方/预览目录膨胀。
                return normalized_version in {"", "1", "2"}

            for item in all_items:
                model = item.get("model") or {}
                name = str(model.get("name") or "").strip()
                version = str(model.get("version") or "").strip()
                fmt = str(model.get("format") or "OpenAI").strip() or "OpenAI"
                kind = str(item.get("kind") or "").strip()
                description = str(item.get("description") or "").strip()

                # 只展示可用于部署的 OpenAI 模型。语音、视觉等 Cognitive Services 模型不适用于当前部署接口。
                if not name or fmt.lower() != "openai":
                    continue
                if not is_recent_official_openai_model(name, version):
                    continue

                sku_name = normalize_deployment_sku(item.get("skuName") or "Standard")
                skus = item.get("skus") or []
                if isinstance(skus, list) and skus:
                    sku_candidates = []
                    for sku_item in skus:
                        sku = sku_item.get("sku") if isinstance(sku_item, dict) else {}
                        sku_candidates.append(normalize_deployment_sku((sku or {}).get("name") or sku_item.get("name") or ""))
                    if "Standard" in sku_candidates:
                        sku_name = "Standard"
                    elif sku_candidates and sku_candidates[0]:
                        sku_name = sku_candidates[0]

                key = (name.lower(), version.lower(), fmt.lower())
                if key in seen_candidates:
                    continue
                seen_candidates.add(key)
                model_candidates.append({
                    "name": name,
                    "version": version,
                    "format": fmt,
                    "sku": sku_name,
                    "kind": kind,
                    "description": description,
                })

            from urllib.parse import quote

            capacity_cache = {}

            def query_deployable_skus(model_info):
                name = str(model_info.get("name") or "").strip()
                version = str(model_info.get("version") or "").strip()
                fmt = str(model_info.get("format") or "OpenAI").strip() or "OpenAI"
                cache_key = (fmt, name, version)
                if cache_key in capacity_cache:
                    return capacity_cache[cache_key]

                cap_url = (
                    f"https://management.azure.com/subscriptions/{self.subscription_id}"
                    f"/providers/Microsoft.CognitiveServices/modelCapacities?api-version=2024-10-01"
                    f"&modelFormat={quote(fmt, safe='')}"
                    f"&modelName={quote(name, safe='')}"
                    f"&modelVersion={quote(version, safe='')}"
                )
                cap_resp = self._arm_request("GET", cap_url, headers=headers, timeout=30)
                if cap_resp.status_code != 200:
                    err_message = cap_resp.text[:500]
                    try:
                        err = cap_resp.json().get("error") or {}
                        err_message = str(err.get("message") or err_message)
                    except Exception:
                        pass
                    result = (False, [], f"查询模型 {name} {version} 的可部署容量失败: HTTP {cap_resp.status_code} - {err_message}")
                    capacity_cache[cache_key] = result
                    return result

                def numeric_prop(source, names, default=None):
                    for prop_name in names:
                        if prop_name in source and source.get(prop_name) not in (None, ""):
                            try:
                                return float(source.get(prop_name))
                            except (TypeError, ValueError):
                                continue
                    return default

                cap_payload = cap_resp.json() if cap_resp.text else {}
                deploy_skus = []
                seen_skus = set()
                for cap_item in cap_payload.get("value") or []:
                    props = cap_item.get("properties") or {}
                    cap_region = _azure_region_code(cap_item.get("location") or props.get("location") or "")
                    if cap_region and cap_region != region_code:
                        continue
                    sku = normalize_deployment_sku(props.get("skuName") or cap_item.get("skuName") or "")
                    available_capacity = numeric_prop(props, ("availableCapacity", "capacity"), 0) or 0
                    if not sku or available_capacity <= 0 or sku.lower() in seen_skus:
                        continue
                    min_capacity = numeric_prop(props, ("minimumCapacity", "minCapacity", "minimum", "min"), None)
                    max_capacity = numeric_prop(props, ("maximumCapacity", "maxCapacity", "maximum", "max"), None)
                    default_capacity = numeric_prop(props, ("defaultCapacity", "default"), None)
                    if min_capacity is None:
                        min_capacity = inferred_min_capacity(name, sku)
                    else:
                        min_capacity = max(min_capacity, inferred_min_capacity(name, sku))
                    if max_capacity is not None and max_capacity < min_capacity:
                        continue
                    if available_capacity < min_capacity:
                        continue
                    if default_capacity is None or default_capacity < min_capacity:
                        default_capacity = min_capacity
                    if max_capacity is not None:
                        default_capacity = min(default_capacity, max_capacity)
                    deploy_skus.append({
                        "sku": sku,
                        "available_capacity": available_capacity,
                        "min_capacity": int(min_capacity),
                        "max_capacity": int(max_capacity) if max_capacity is not None else None,
                        "default_capacity": max(1, int(default_capacity)),
                    })
                    seen_skus.add(sku.lower())

                result = (True, deploy_skus, "")
                capacity_cache[cache_key] = result
                return result

            models = []
            seen = set()
            capacity_errors = []
            for candidate in model_candidates:
                ok, deploy_skus, cap_message = query_deployable_skus(candidate)
                if not ok:
                    capacity_errors.append(cap_message)
                    continue
                for deploy_sku_info in deploy_skus:
                    deploy_sku = str(deploy_sku_info.get("sku") or "").strip()
                    if not deploy_sku:
                        continue
                    key = (
                        str(candidate.get("name", "")).lower(),
                        str(candidate.get("version", "")).lower(),
                        str(candidate.get("format", "")).lower(),
                        deploy_sku.lower(),
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    item = dict(candidate)
                    item["sku"] = deploy_sku
                    item["available_capacity"] = deploy_sku_info.get("available_capacity")
                    item["min_capacity"] = deploy_sku_info.get("min_capacity")
                    item["max_capacity"] = deploy_sku_info.get("max_capacity")
                    item["default_capacity"] = deploy_sku_info.get("default_capacity")
                    models.append(item)

            models.sort(key=lambda m: (
                model_name_sort_key(m.get("name")),
                -(version_date(m.get("version")) or date.min).toordinal(),
                str(m.get("version", "")),
                0 if str(m.get("sku", "")).lower() in {"globalstandard", "standard"} else 1,
                int(m.get("default_capacity") or 1),
            ))

            if not models:
                if capacity_errors:
                    msg = (
                        f"已读取到 {region_code} 区域模型目录，但无法确认当前账号在该区域有可用部署容量/SKU。"
                        "为避免点“开始部署”后才失败，已禁用开始部署。请切换区域或检查 Azure OpenAI/Foundry 部署权限。\n"
                        f"首个错误：{capacity_errors[0]}"
                    )
                else:
                    msg = (
                        f"当前账号在 {region_code} 区域没有可用的模型部署容量/SKU。"
                        "这通常表示该区域对当前订阅不可部署、没有 Azure OpenAI/Foundry 部署权限，或模型容量为 0。"
                        "请切换区域后重试。"
                    )
                return True, {"region": region_code, "deployable": False, "models": [], "message": msg}, msg

            msg = (
                f"已确认当前账号在 {region_code} 区域有可部署容量的模型 {len(models)} 个。"
                f"Azure 原始返回 {len(all_items)} 个，已先筛选最近{model_filter_months}个月官方 OpenAI 模型 {len(model_candidates)} 个后再查询容量。"
            )
            return True, {
                "region": region_code,
                "deployable": True,
                "models": models,
                "message": msg,
                "raw_model_count": len(all_items),
                "filtered_model_count": len(model_candidates),
                "model_filter_months": model_filter_months,
            }, msg
        except Exception as e:
            logging.error(f"查询 Foundry 模型可用性失败: {e}", exc_info=True)
            msg = f"查询 Azure 模型可用性失败: {e}"
            return True, {"region": region_code, "deployable": False, "models": [], "message": msg}, msg

    def ensure_foundry_resource(self, region: str, resource_group: str = "rg-foundry",
                                account_name: Optional[str] = None, log_callback=None,
                                stop_event=None) -> tuple:
        """
        创建或复用 Microsoft Foundry 资源。

        Azure portal 中的 Foundry 资源对应 ARM:
        Microsoft.CognitiveServices/accounts，kind=AIServices，sku=S0。
        返回 endpoint/key，便于用户直接在 Foundry/Azure AI 相关 SDK 中使用。
        """
        def log(msg, level="INFO"):
            if log_callback:
                log_callback(msg, level)

        if not self.is_connected or not self.subscription_id:
            return False, None, "未连接到 Azure"
        if stop_event is not None and stop_event.is_set():
            return False, None, "操作被取消"

        region_code = _azure_region_code(region)
        if not region_code:
            return False, None, "区域不能为空"

        import re
        safe_rg = (resource_group or "rg-foundry").strip()
        if not safe_rg:
            safe_rg = "rg-foundry"

        if not account_name:
            suffix = uuid.uuid4().hex[:8]
            account_name = f"foundry-{region_code}-{suffix}"
        account_name = account_name.strip().lower()
        account_name = re.sub(r"[^a-z0-9-]", "-", account_name)
        account_name = re.sub(r"-+", "-", account_name).strip("-")
        if len(account_name) < 2:
            account_name = f"foundry-{uuid.uuid4().hex[:8]}"
        if len(account_name) > 64:
            account_name = account_name[:64].strip("-")

        headers = self._arm_headers()
        base = f"https://management.azure.com/subscriptions/{self.subscription_id}"

        try:
            log("正在注册 Microsoft.CognitiveServices 资源提供程序...")
            provider_url = f"{base}/providers/Microsoft.CognitiveServices/register?api-version=2021-04-01"
            reg_resp = self._arm_request("POST", provider_url, headers=headers, timeout=30)
            if reg_resp.status_code not in (200, 202):
                log(f"资源提供程序注册返回 HTTP {reg_resp.status_code}，继续尝试创建。", "WARN")

            if stop_event is not None and stop_event.is_set():
                return False, None, "操作被取消"

            log(f"正在创建/确认资源组 {safe_rg}...")
            # Azure 资源组自身的 location 是元数据，创建后不能修改；同一个资源组仍然可以
            # 容纳不同区域的 Cognitive Services/Foundry 资源。换 Foundry 区域时不要用新区
            # create_or_update 已存在资源组，否则会触发 InvalidResourceGroupLocation。
            rg_exists = False
            if self.resource_client:
                try:
                    existing_rg = self.resource_client.resource_groups.get(safe_rg)
                    rg_exists = True
                    log(f"资源组 {safe_rg} 已存在，位置为 {getattr(existing_rg, 'location', '')}，将直接复用。")
                except ResourceNotFoundError:
                    rg_exists = False
                if not rg_exists:
                    log(f"正在创建资源组 {safe_rg} ({region_code})...")
                    self.resource_client.resource_groups.create_or_update(safe_rg, {"location": region_code})
            else:
                rg_url = f"{base}/resourcegroups/{safe_rg}?api-version=2021-04-01"
                rg_get_resp = self._arm_request("GET", rg_url, headers=headers, timeout=30)
                if rg_get_resp.status_code == 200:
                    rg_exists = True
                    rg_location = (rg_get_resp.json() or {}).get("location", "")
                    log(f"资源组 {safe_rg} 已存在，位置为 {rg_location}，将直接复用。")
                elif rg_get_resp.status_code != 404:
                    return False, None, f"查询资源组失败: HTTP {rg_get_resp.status_code} - {rg_get_resp.text[:300]}"
                if not rg_exists:
                    log(f"正在创建资源组 {safe_rg} ({region_code})...")
                    rg_resp = self._arm_request("PUT", rg_url, headers=headers, json={"location": region_code}, timeout=30)
                    if rg_resp.status_code not in (200, 201):
                        return False, None, f"创建资源组失败: HTTP {rg_resp.status_code} - {rg_resp.text[:300]}"

            acct_url = (
                f"{base}/resourceGroups/{safe_rg}/providers/Microsoft.CognitiveServices"
                f"/accounts/{account_name}?api-version=2024-10-01"
            )
            get_resp = self._arm_request("GET", acct_url, headers=headers, timeout=30)
            if get_resp.status_code == 200:
                log(f"Foundry 资源已存在，将复用: {account_name}")
                account_data = get_resp.json()
            elif get_resp.status_code == 404:
                log(f"正在创建 Microsoft Foundry 资源 {account_name}...")
                payload = {
                    "location": region_code,
                    "kind": "AIServices",
                    "sku": {"name": "S0"},
                    "properties": {
                        "customSubDomainName": account_name,
                        "publicNetworkAccess": "Enabled"
                    }
                }
                put_resp = self._arm_request("PUT", acct_url, headers=headers, json=payload, timeout=60)
                if put_resp.status_code not in (200, 201, 202):
                    return False, None, f"创建 Foundry 资源失败: HTTP {put_resp.status_code} - {put_resp.text[:500]}"

                # Cognitive Services account 创建通常很快。若返回 202，轮询 provisioningState。
                account_data = put_resp.json() if put_resp.text else {}
                for _ in range(30):
                    if stop_event is not None and stop_event.is_set():
                        return False, None, "操作被取消"
                    state = ((account_data.get("properties") or {}).get("provisioningState") or "").lower()
                    if state in ("succeeded", "failed", "canceled"):
                        break
                    time.sleep(5)
                    poll_resp = self._arm_request("GET", acct_url, headers=headers, timeout=30)
                    if poll_resp.status_code == 200:
                        account_data = poll_resp.json()
                state = ((account_data.get("properties") or {}).get("provisioningState") or "").lower()
                if state and state != "succeeded":
                    return False, None, f"Foundry 资源创建未成功，当前状态: {state}"
            else:
                return False, None, f"查询 Foundry 资源失败: HTTP {get_resp.status_code} - {get_resp.text[:300]}"

            props = account_data.get("properties") or {}
            endpoint = props.get("endpoint") or f"https://{account_name}.cognitiveservices.azure.com/"

            key = ""
            keys_url = (
                f"{base}/resourceGroups/{safe_rg}/providers/Microsoft.CognitiveServices"
                f"/accounts/{account_name}/listKeys?api-version=2024-10-01"
            )
            key_resp = self._arm_request("POST", keys_url, headers=headers, timeout=30)
            if key_resp.status_code == 200:
                key_data = key_resp.json()
                key = key_data.get("key1") or key_data.get("key2") or ""
            else:
                log(f"获取 Foundry Key 失败: HTTP {key_resp.status_code}。可在 Azure Portal 中手动查看。", "WARN")

            portal_url = (
                f"https://ai.azure.com/resource/overview?wsid=/subscriptions/{self.subscription_id}"
                f"/resourceGroups/{safe_rg}/providers/Microsoft.CognitiveServices/accounts/{account_name}"
            )
            result = {
                "resource_group": safe_rg,
                "name": account_name,
                "region": region_code,
                "kind": account_data.get("kind", "AIServices"),
                "sku": ((account_data.get("sku") or {}).get("name") or "S0"),
                "endpoint": endpoint,
                "key": key,
                "portal_url": portal_url,
                "id": account_data.get("id", "")
            }
            log("Microsoft Foundry 资源准备完成。")
            return True, result, "Foundry 功能已开启/可使用"
        except Exception as e:
            logging.error(f"开启 Foundry 功能失败: {e}", exc_info=True)
            return False, None, str(e)

    def deploy_foundry_model(self, foundry: Dict[str, Any], deployment_name: str,
                             model_name: str = "gpt-4o-mini", model_version: str = "2024-07-18",
                             model_format: str = "OpenAI", sku_name: str = "Standard",
                             capacity: int = 1, log_callback=None, stop_event=None) -> tuple:
        """为已创建的 Foundry/Azure AI Services 资源创建或更新模型部署。"""
        def log(msg, level="INFO"):
            if log_callback:
                log_callback(msg, level)

        if not self.is_connected or not self.subscription_id:
            return False, None, "未连接到 Azure"
        if not isinstance(foundry, dict) or not foundry.get("name") or not foundry.get("resource_group"):
            return False, None, "未找到可用的 Foundry 资源信息，请先开启 Foundry"
        if stop_event is not None and stop_event.is_set():
            return False, None, "操作被取消"

        import re
        account_name = str(foundry.get("name", "")).strip()
        resource_group = str(foundry.get("resource_group", "")).strip()
        region_code = _azure_region_code(foundry.get("region", ""))
        deployment_name = (deployment_name or "").strip()
        model_name = (model_name or "").strip()
        model_version = (model_version or "").strip()
        model_format = (model_format or "OpenAI").strip() or "OpenAI"
        sku_name = (sku_name or "Standard").strip() or "Standard"
        if sku_name.upper() in {"S0", "F0"}:
            # S0/F0 是 AIServices/Cognitive Services 账号资源层级 SKU，deployment PUT 不接受。
            sku_name = "Standard"
        try:
            capacity = int(capacity)
        except (TypeError, ValueError):
            capacity = 1
        if capacity <= 0:
            capacity = 1
        inferred_min_capacity = 1
        if model_name.lower().startswith("gpt-5"):
            inferred_min_capacity = 15
        if "provisioned" in sku_name.lower():
            inferred_min_capacity = max(inferred_min_capacity, 15)
        if capacity < inferred_min_capacity:
            log(f"模型 {model_name} / SKU {sku_name} 要求容量至少 {inferred_min_capacity}，已自动将容量从 {capacity} 调整为 {inferred_min_capacity}。")
            capacity = inferred_min_capacity

        if not deployment_name:
            return False, None, "部署名称不能为空"
        deployment_name = re.sub(r"[^A-Za-z0-9_-]", "-", deployment_name)[:64].strip("-_")
        if not deployment_name:
            return False, None, "部署名称无效"
        if not model_name:
            return False, None, "模型名称不能为空"

        headers = self._arm_headers()
        base = f"https://management.azure.com/subscriptions/{self.subscription_id}"
        deployment_url = (
            f"{base}/resourceGroups/{resource_group}/providers/Microsoft.CognitiveServices"
            f"/accounts/{account_name}/deployments/{deployment_name}?api-version=2024-10-01"
        )

        try:
            log(f"正在检查 Foundry 资源 {account_name}...")
            acct_url = (
                f"{base}/resourceGroups/{resource_group}/providers/Microsoft.CognitiveServices"
                f"/accounts/{account_name}?api-version=2024-10-01"
            )
            acct_resp = self._arm_request("GET", acct_url, headers=headers, timeout=30)
            if acct_resp.status_code != 200:
                return False, None, f"查询 Foundry 资源失败: HTTP {acct_resp.status_code} - {acct_resp.text[:300]}"
            account_data = acct_resp.json()
            acct_props = account_data.get("properties") or {}
            endpoint = foundry.get("endpoint") or acct_props.get("endpoint") or f"https://{account_name}.cognitiveservices.azure.com/"
            if not region_code:
                region_code = _azure_region_code(account_data.get("location", ""))

            def build_payload(current_sku):
                return {
                    "sku": {
                        "name": current_sku,
                        "capacity": capacity
                    },
                    "properties": {
                        "model": {
                            "format": model_format,
                            "name": model_name,
                            "version": model_version
                        }
                    }
                }

            log(f"正在创建/更新模型部署 {deployment_name}: {model_name} {model_version}，SKU: {sku_name}，容量: {capacity}...")
            payload = build_payload(sku_name)
            put_resp = self._arm_request("PUT", deployment_url, headers=headers, json=payload, timeout=60)
            if put_resp.status_code not in (200, 201, 202):
                try:
                    first_err = put_resp.json().get("error") or {}
                    first_err_code = str(first_err.get("code") or "")
                    first_err_message = str(first_err.get("message") or "")
                except Exception:
                    first_err_code = ""
                    first_err_message = put_resp.text[:800]
                if first_err_code == "InvalidResourceProperties" and "sku name" in first_err_message.lower():
                    fallback_skus = ["Standard", "GlobalStandard", "DataZoneStandard", "ProvisionedManaged"]
                    for fallback_sku in fallback_skus:
                        if fallback_sku.lower() == sku_name.lower():
                            continue
                        log(f"Azure 不接受部署 SKU {sku_name}，正在自动尝试 {fallback_sku}...", "WARN")
                        retry_payload = build_payload(fallback_sku)
                        retry_resp = self._arm_request("PUT", deployment_url, headers=headers, json=retry_payload, timeout=60)
                        if retry_resp.status_code in (200, 201, 202):
                            sku_name = fallback_sku
                            payload = retry_payload
                            put_resp = retry_resp
                            break
            if put_resp.status_code not in (200, 201, 202):
                err_code = ""
                err_message = ""
                try:
                    err = put_resp.json().get("error") or {}
                    err_code = str(err.get("code") or "")
                    err_message = str(err.get("message") or "")
                except Exception:
                    err_message = put_resp.text[:800]

                if err_code == "CannotDeployDueToLocalRegulations":
                    return False, None, (
                        "部署模型失败：当前订阅暂不具备 Azure OpenAI Service 部署资格。\n\n"
                        "Azure 返回 CannotDeployDueToLocalRegulations：根据当地监管要求，中国大陆地区只有具备注册营业执照的企业客户"
                        "可订阅 Azure OpenAI Service。这个限制属于 Azure 账号/订阅资格限制，换 Foundry 区域、换模型或改 SKU 通常无法绕过。\n\n"
                        "可行处理：\n"
                        "1. 使用已获批 Azure OpenAI / Foundry 模型部署权限的订阅；\n"
                        "2. 如果你是企业客户，按 Azure 提示联系微软认证合作伙伴或 Microsoft 支持申请开通；\n"
                        "3. 如果只是需要非 OpenAI Cognitive Services，此 Foundry 资源可保留，但 OpenAI 模型部署会继续失败。"
                    )

                if err_code == "InvalidResourceProperties" and "not supported in this region" in err_message:
                    return False, None, (
                        f"部署模型失败：当前 Foundry 区域 {region_code} 不支持模型 {model_name} {model_version} 的 SKU {sku_name}。\n\n"
                        "请在 Foundry 信息中点击“修改”，换区域重新开启 Foundry 资源后再部署。"
                        "建议优先尝试 eastus、eastus2、swedencentral、westus3、francecentral 或 australiaeast。\n\n"
                        f"Azure 原始错误：HTTP {put_resp.status_code} - {err_message or put_resp.text[:500]}"
                    )

                return False, None, f"部署模型失败: HTTP {put_resp.status_code} - {put_resp.text[:800]}"

            deployment_data = put_resp.json() if put_resp.text else {}
            for _ in range(60):
                if stop_event is not None and stop_event.is_set():
                    return False, None, "操作被取消"
                state = ((deployment_data.get("properties") or {}).get("provisioningState") or "").lower()
                if state in ("succeeded", "failed", "canceled"):
                    break
                time.sleep(5)
                poll_resp = self._arm_request("GET", deployment_url, headers=headers, timeout=30)
                if poll_resp.status_code == 200:
                    deployment_data = poll_resp.json()

            props = deployment_data.get("properties") or {}
            state = props.get("provisioningState") or ""
            if state and state.lower() != "succeeded":
                return False, None, f"模型部署未成功，当前状态: {state}"

            key = foundry.get("key", "")
            if not key:
                keys_url = (
                    f"{base}/resourceGroups/{resource_group}/providers/Microsoft.CognitiveServices"
                    f"/accounts/{account_name}/listKeys?api-version=2024-10-01"
                )
                key_resp = self._arm_request("POST", keys_url, headers=headers, timeout=30)
                if key_resp.status_code == 200:
                    key_data = key_resp.json()
                    key = key_data.get("key1") or key_data.get("key2") or ""

            result = {
                "deployment_name": deployment_name,
                "model_name": model_name,
                "model_version": model_version,
                "model_format": model_format,
                "sku": sku_name,
                "capacity": capacity,
                "status": state or "Succeeded",
                "region": region_code,
                "resource_group": resource_group,
                "account_name": account_name,
                "endpoint": endpoint,
                "key": key,
                "id": deployment_data.get("id", "")
            }
            log("模型部署完成。")
            return True, result, "模型部署已完成"
        except Exception as e:
            logging.error(f"部署 Foundry 模型失败: {e}", exc_info=True)
            return False, None, str(e)

    def get_regions(self) -> List[str]:
        if not self.is_connected:
            return []
            
        if hasattr(self, '_cached_regions') and self._cached_regions:
            return self._cached_regions
            
        try:
            access_token = self.credential.get_token("https://management.azure.com/.default").token
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept-Language": "zh-CN"
            }
            
            allowed_locations_sets = []
            try:
                policy_url = f"https://management.azure.com/subscriptions/{self.subscription_id}/providers/Microsoft.Authorization/policyAssignments?api-version=2020-09-01"
                policy_resp = requests.get(policy_url, headers=headers, timeout=10)
                if policy_resp.status_code == 200:
                    policy_data = policy_resp.json()
                    for assignment in policy_data.get('value', []):
                        props = assignment.get('properties', {})
                        params = props.get('parameters', {})
                        if 'listOfAllowedLocations' in params:
                            val = params['listOfAllowedLocations'].get('value')
                            if isinstance(val, list):
                                allowed_locations_sets.append(set([v.lower() for v in val]))
            except Exception as e:
                logging.warning(f"获取策略分配(Policy)异常: {e}")

            allowed_locations = None
            if allowed_locations_sets:
                allowed_locations = allowed_locations_sets[0]
                for s in allowed_locations_sets[1:]:
                    allowed_locations = allowed_locations.intersection(s)

            url = f"https://management.azure.com/subscriptions/{self.subscription_id}/locations?api-version=2020-01-01"
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                regions = []
                for loc in data.get('value', []):
                    if loc.get('metadata', {}).get('regionType') == 'Physical':
                        name = loc.get('name')
                        if not name:
                            continue
                            
                        if allowed_locations is not None and name.lower() not in allowed_locations:
                            continue

                        cn_name = AZURE_REGIONS_CN.get(name)
                        display_name = loc.get('displayName', '')
                        
                        final_name = cn_name if cn_name else display_name
                        
                        if final_name and final_name != name:
                            regions.append(f"{final_name} ({name})")
                        else:
                            regions.append(name)
                if regions:
                    def sort_key(item):
                        import re
                        match = re.search(r'\(([^)]+)\)$', item)
                        if match:
                            return match.group(1).lower()
                        return item.lower()
                    self._cached_regions = sorted(regions, key=sort_key)
                    return self._cached_regions
            else:
                logging.error(f"获取区域列表失败: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            logging.error(f"获取区域列表失败: {e}")
        return []

    def get_ip_permission(self, region: str) -> str:
        if not self.network_client:
            return "Both"
        try:
            usages = self.network_client.usages.list(region)
            has_basic = False
            has_standard = False
            for usage in usages:
                name = usage.name.value.lower()
                if 'public ip' in name or 'publicip' in name:
                    if usage.limit > 0 or usage.limit == -1:
                        if 'basic' in name:
                            has_basic = True
                        elif 'standard' in name:
                            has_standard = True
            
            if has_basic and has_standard:
                return "Both"
            elif has_standard and not has_basic:
                return "Static"
            elif has_basic and not has_standard:
                return "Dynamic"
            
            return "Both"
        except Exception as e:
            logging.warning(f"获取 IP 权限失败: {e}")
            return "Both"

    def get_supported_vm_sizes(self, region: str) -> List[str]:
        if not self.is_connected or not self.compute_client:
            return []
        try:
            available_sizes = []
            try:
                skus = self.compute_client.resource_skus.list(filter=f"location eq '{region}'")
                for sku in skus:
                    if sku.resource_type == 'virtualMachines':
                        is_restricted = False
                        if hasattr(sku, 'restrictions') and sku.restrictions:
                            for restriction in sku.restrictions:
                                r_type = getattr(restriction.type, 'name', str(getattr(restriction, 'type', '')))
                                if r_type.lower() == 'location':
                                    is_restricted = True
                                    break
                                r_reason = getattr(restriction, 'reason_code', getattr(restriction, 'reasonCode', ''))
                                if 'Capacity' in str(r_reason) or 'NotAvailableForSubscription' in str(r_reason):
                                    is_restricted = True
                                    break
                        if not is_restricted:
                            available_sizes.append(sku.name)
                
                if available_sizes:
                    return sorted(list(set(available_sizes)))
            except Exception as e:
                logging.warning(f"使用 resource_skus 获取 VM 规格失败，尝试回退: {e}")

            sizes = self.compute_client.virtual_machine_sizes.list(location=region)
            return [size.name for size in sizes]
        except Exception as e:
            logging.warning(f"获取区域 {region} 的 VM 规格失败: {e}")
            return []

    def get_supported_os_images(self, region: str, vm_size: str) -> List[Dict]:
        if not self.is_connected or not self.compute_client:
            return []

        vm_size_lower = vm_size.lower()
        is_arm = "pts" in vm_size_lower or "arm" in vm_size_lower or "ps" in vm_size_lower

        targets = [
            {"publisher": "Canonical", "offer": "ubuntu-24_04-lts", "sku": "server-arm64" if is_arm else "server-gen2", "os": "Ubuntu 24.04"},
            {"publisher": "Canonical", "offer": "0001-com-ubuntu-server-jammy", "sku": "22_04-lts-arm64" if is_arm else "22_04-lts-gen2", "os": "Ubuntu 22.04"},
            {"publisher": "Canonical", "offer": "0001-com-ubuntu-server-focal", "sku": "20_04-lts-arm64" if is_arm else "20_04-lts-gen2", "os": "Ubuntu 20.04"},
            {"publisher": "Debian", "offer": "debian-12", "sku": "12-arm64-gen2" if is_arm else "12-gen2", "os": "Debian 12"},
            {"publisher": "Debian", "offer": "debian-11", "sku": "11-backports-arm64-gen2" if is_arm else "11-backports-gen2", "os": "Debian 11"},
            {"publisher": "OpenLogic", "offer": "CentOS", "sku": "8_5-gen2", "os": "CentOS 8"}
        ]

        results = []
        for t in targets:
            try:
                images = list(self.compute_client.virtual_machine_images.list(
                    location=region,
                    publisher_name=t["publisher"],
                    offer=t["offer"],
                    skus=t["sku"]
                ))
                if images:
                    images.sort(key=lambda x: x.name, reverse=True)
                    img = images[0]
                    results.append({
                        "display_name": f"{t['os']} ({img.name})",
                        "publisher": t["publisher"],
                        "offer": t["offer"],
                        "sku": t["sku"],
                        "version": img.name
                    })
            except Exception as e:
                logging.warning(f"获取镜像失败 {t['os']}: {e}")

        return results

    def get_vms(self, alias=None, compute_client=None, network_client=None) -> Dict:
        if compute_client is None: compute_client = self.compute_client
        if network_client is None: network_client = self.network_client
        if alias is None: alias = self.connected_alias
        
        if not compute_client:
            raise Exception("未连接到 Azure")

        vm_list = []
        try:
            for vm in compute_client.virtual_machines.list_all():
                resource_group = vm.id.split('/')[4]
                status, public_ip, ip_allocation_method = "Unknown", "N/A", None
                
                try:
                    instance_view = compute_client.virtual_machines.instance_view(resource_group, vm.name)
                    power_state = next((s for s in instance_view.statuses if s.code.startswith('PowerState/')), None)
                    if power_state:
                        status = power_state.display_status.replace("VM ", "")
                except ResourceNotFoundError:
                    status = "Not Found"

                try:
                    if vm.network_profile and vm.network_profile.network_interfaces:
                        nic_id = vm.network_profile.network_interfaces[0].id
                        nic_name = nic_id.split('/')[-1]
                        nic = network_client.network_interfaces.get(resource_group, nic_name)
                        if nic.ip_configurations and nic.ip_configurations[0].public_ip_address:
                            pip_id = nic.ip_configurations[0].public_ip_address.id
                            pip_name = pip_id.split('/')[-1]
                            pip = network_client.public_ip_addresses.get(resource_group, pip_name)
                            public_ip = pip.ip_address
                            ip_allocation_method = getattr(pip, 'public_ip_allocation_method', None)
                except Exception as e:
                    logging.warning(f"获取 {vm.name} 的 IP 失败: {e}")
                    public_ip = "查询失败"

                disk_size = "N/A"
                if vm.storage_profile and vm.storage_profile.os_disk and vm.storage_profile.os_disk.disk_size_gb is not None:
                    disk_size = f"{vm.storage_profile.os_disk.disk_size_gb} GiB"

                vm_data = {
                    "id": vm.id,
                    "name": vm.name,
                    "location": vm.location,
                    "vm_size": vm.hardware_profile.vm_size if vm.hardware_profile else "N/A",
                    "status": status,
                    "resource_group": resource_group,
                    "public_ip": public_ip,
                    "ip_allocation_method": ip_allocation_method,
                    "disk_size": disk_size,
                    "time_created": getattr(vm, "time_created", None)
                }
                
                if vm_data["time_created"] is not None:
                    vm_data["time_created"] = vm_data["time_created"].strftime("%Y-%m-%d %H:%M:%S")
                else:
                    vm_data["time_created"] = "N/A"
                    
                vm_list.append(vm_data)
        except Exception as e:
            logging.error(f"获取虚拟机列表失败: {e}")
            raise

        return {"alias": alias, "vms": vm_list}

    def create_vm(self, data, wait=True, log_callback=None, stop_event=None, global_ssh_key=None):
        if not self.is_connected:
            raise Exception("未连接到 Azure")
            
        def log(msg, level="INFO"):
            if log_callback: log_callback(msg, level)
            
        region = data.get('region')
        vm_size = data.get('vm_size')
        os_image_key = data.get('os_image', '')
        os_image_data = data.get('os_image_data')
        ip_type = data.get('ip_type', 'Static')
        disk_size_gb = data.get('disk_size_gb', 64)
        disk_type = data.get('disk_type', 'Premium_LRS')
        user_data = data.get('user_data', '')
        vm_name_input = data.get('vm_name', '').strip()
        custom_username = data.get('custom_username', '').strip()
        custom_password = data.get('custom_password', '').strip()
        use_global_ssh = data.get('use_global_ssh', True)
        dd_system = data.get('dd_system', False)
        dd_password = data.get('dd_password', '').strip()
        
        timestamp = int(time.time())
        vm_name = vm_name_input if vm_name_input else f"vm-{region.replace(' ', '').lower()}-{timestamp}"
        rg_name = (data.get('resource_group') or '').strip() or f"rg-{vm_name}"
        
        target_username = custom_username if custom_username else "root"
        
        import string
        import random
        chars = string.ascii_letters + string.digits + "!@#$%^&*"
        generated_password = ''.join(random.choice(chars) for _ in range(16)) + "A1a!"
        
        target_password = custom_password if custom_password else generated_password
        
        if target_username.lower() == "root":
            admin_username = "azureuser"
        else:
            admin_username = target_username
            
        admin_password = target_password

        ssh_key_data = None
        if use_global_ssh and global_ssh_key:
            ssh_key_data = global_ssh_key
        
        if os_image_data:
            image_reference = {
                "publisher": os_image_data["publisher"],
                "offer": os_image_data["offer"],
                "sku": os_image_data["sku"],
                "version": os_image_data["version"]
            }
        else:
            is_arm = "pts" in vm_size.lower() or "arm" in vm_size.lower()

            publisher, offer, version = "Canonical", "0001-com-ubuntu-server-jammy", "latest"
            sku = "22_04-lts-arm64" if is_arm else "22_04-lts-gen2"
            
            if "Ubuntu-24.04" in os_image_key:
                publisher, offer, version = "Canonical", "ubuntu-24_04-lts", "latest"
                sku = "server-arm64" if is_arm else "server-gen2"
            elif "Ubuntu-22.04" in os_image_key:
                publisher, offer, version = "Canonical", "0001-com-ubuntu-server-jammy", "latest"
                sku = "22_04-lts-arm64" if is_arm else "22_04-lts-gen2"
            elif "Ubuntu-20.04" in os_image_key:
                publisher, offer, version = "Canonical", "0001-com-ubuntu-server-focal", "latest"
                sku = "20_04-lts-arm64" if is_arm else "20_04-lts-gen2"
            elif "Debian-11" in os_image_key:
                publisher, offer, version = "Debian", "debian-11", "latest"
                sku = "11-backports-arm64-gen2" if is_arm else "11-backports-gen2"
            elif "Debian-12" in os_image_key:
                publisher, offer, version = "Debian", "debian-12", "latest"
                sku = "12-arm64-gen2" if is_arm else "12-gen2"
            elif "CentOS-8" in os_image_key:
                publisher, offer, version = "OpenLogic", "CentOS", "latest"
                sku = "8_5-gen2" 

            image_reference = {
                "publisher": publisher,
                "offer": offer,
                "sku": sku,
                "version": version
            }
        
        log(f"正在创建资源组 {rg_name}...", "INFO")
        self.resource_client.resource_groups.create_or_update(rg_name, {"location": region})
        
        try:
            log(f"正在创建虚拟网络 vnet-{vm_name}...", "INFO")
            vnet_params = {
                "location": region,
                "properties": {
                    "addressSpace": {"addressPrefixes": ["10.0.0.0/16"]},
                    "subnets": [{"name": "default", "properties": {"addressPrefix": "10.0.0.0/24"}}]
                }
            }
            vnet_poller = self.network_client.virtual_networks.begin_create_or_update(rg_name, f"vnet-{vm_name}", vnet_params)
            subnet_id = vnet_poller.result().subnets[0].id
            
            log(f"正在创建公共IP pip-{vm_name} ({ip_type})...", "INFO")
            ip_sku = {"name": "Basic"} if ip_type == "Dynamic" else {"name": "Standard"}
            pip_params = {
                "location": region,
                "sku": ip_sku,
                "properties": {
                    "publicIPAllocationMethod": ip_type
                }
            }
            pip_poller = self.network_client.public_ip_addresses.begin_create_or_update(rg_name, f"pip-{vm_name}", pip_params)
            public_ip_id = pip_poller.result().id
            
            log(f"正在创建网络安全组 nsg-{vm_name} 并放行端口...", "INFO")
            nsg_name = f"nsg-{vm_name}"
            nsg_params = {
                'location': region,
                'properties': {
                    'securityRules': [
                        {
                            'name': 'AllowSSH',
                            'properties': {
                                'protocol': 'Tcp',
                                'sourceAddressPrefix': '*',
                                'sourcePortRange': '*',
                                'destinationAddressPrefix': '*',
                                'destinationPortRange': '22',
                                'access': 'Allow',
                                'direction': 'Inbound',
                                'priority': 1000
                            }
                        },
                        {
                            'name': 'AllowAll_Inbound',
                            'properties': {
                                'protocol': '*',
                                'sourceAddressPrefix': '*',
                                'sourcePortRange': '*',
                                'destinationAddressPrefix': '*',
                                'destinationPortRange': '*',
                                'access': 'Allow',
                                'direction': 'Inbound',
                                'priority': 1010
                            }
                        },
                        {
                            'name': 'AllowAll_Outbound',
                            'properties': {
                                'protocol': '*',
                                'sourceAddressPrefix': '*',
                                'sourcePortRange': '*',
                                'destinationAddressPrefix': '*',
                                'destinationPortRange': '*',
                                'access': 'Allow',
                                'direction': 'Outbound',
                                'priority': 1000
                            }
                        }
                    ]
                }
            }
            nsg_poller = self.network_client.network_security_groups.begin_create_or_update(rg_name, nsg_name, nsg_params)
            nsg_id = nsg_poller.result().id
            
            log(f"正在创建网络接口 nic-{vm_name}...", "INFO")
            nic_params = {
                "location": region,
                "properties": {
                    "ipConfigurations": [{
                        "name": "ipconfig1",
                        "properties": {
                            "subnet": {"id": subnet_id},
                            "publicIPAddress": {"id": public_ip_id}
                        }
                    }],
                    "networkSecurityGroup": {"id": nsg_id}
                }
            }
            nic_poller = self.network_client.network_interfaces.begin_create_or_update(rg_name, f"nic-{vm_name}", nic_params)
            nic_id = nic_poller.result().id
            
            log(f"正在创建虚拟机 {vm_name} (这可能需要几分钟)...", "WARN")
            import base64
            
            user_data = user_data.strip()
            if user_data and not user_data.startswith("#!"):
                user_data = "#!/bin/bash\n" + user_data
            elif not user_data:
                user_data = "#!/bin/bash\n"

            if dd_system:
                if ssh_key_data:
                    user_data += f"""
# Auto-setup root SSH login for DD system
mkdir -p /root/.ssh
echo "{ssh_key_data}" > /root/.ssh/authorized_keys
sed -i -E 's/^command=.* (ssh-rsa|ssh-ed25519|ecdsa-[a-zA-Z0-9-]+) /\\1 /' /root/.ssh/authorized_keys || true
chown -R root:root /root/.ssh
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
grep -q "PubkeyAcceptedAlgorithms +ssh-rsa" /etc/ssh/sshd_config || echo "PubkeyAcceptedAlgorithms +ssh-rsa" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh
"""
                post_cmd_b64 = base64.b64encode(user_data.encode('utf-8')).decode('utf-8')
                
                dd_cmd = "\n# Auto DD System\n"
                dd_cmd += "curl -sL https://raw.githubusercontent.com/SIJULY/DD/main/Azure_DD.sh > /tmp/Azure_DD.sh\n"
                
                actual_dd_pwd = dd_password if dd_password else custom_password
                if actual_dd_pwd:
                    escaped_pwd = actual_dd_pwd.replace("'", "'\\''")
                    dd_cmd += f"sed -i 's/^new_pwd=.*/new_pwd='\\''{escaped_pwd}'\\''/g' /tmp/Azure_DD.sh\n"
                dd_cmd += f"sed -i 's|^post_cmd=.*|post_cmd=\"{post_cmd_b64}\"|g' /tmp/Azure_DD.sh\n"
                dd_cmd += "bash /tmp/Azure_DD.sh\n"
                
                current_instance_data = "#!/bin/bash\n" + dd_cmd
                custom_data_b64 = base64.b64encode(current_instance_data.encode('utf-8')).decode('utf-8')
            else:
                if target_username.lower() == "root":
                    root_setup = f"""
# Auto-setup root SSH login
sleep 5
mkdir -p /root/.ssh
"""
                    if ssh_key_data:
                        root_setup += f'echo "{ssh_key_data}" > /root/.ssh/authorized_keys\n'
                    else:
                        root_setup += f"""if [ -f /home/{admin_username}/.ssh/authorized_keys ]; then
    cp /home/{admin_username}/.ssh/authorized_keys /root/.ssh/authorized_keys
fi
"""
                    root_setup += f"""sed -i -E 's/^command=.* (ssh-rsa|ssh-ed25519|ecdsa-[a-zA-Z0-9-]+) /\\1 /' /root/.ssh/authorized_keys || true
chown -R root:root /root/.ssh
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
echo "root:{admin_password}" | chpasswd
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/g' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
grep -q "PubkeyAcceptedAlgorithms +ssh-rsa" /etc/ssh/sshd_config || echo "PubkeyAcceptedAlgorithms +ssh-rsa" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh
"""
                    user_data += "\n" + root_setup
                else:
                    setup_cmd = f"""
# Ensure password authentication is allowed for non-root user
sleep 5
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/g' /etc/ssh/sshd_config
grep -q "PubkeyAcceptedAlgorithms +ssh-rsa" /etc/ssh/sshd_config || echo "PubkeyAcceptedAlgorithms +ssh-rsa" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh
"""
                    user_data += "\n" + setup_cmd
                
                custom_data_b64 = base64.b64encode(user_data.encode('utf-8')).decode('utf-8')

            vm_parameters = {
                "location": region,
                "properties": {
                    "hardwareProfile": {
                        "vmSize": vm_size
                    },
                    "storageProfile": {
                        "imageReference": image_reference,
                        "osDisk": {
                            "createOption": "FromImage",
                            "diskSizeGB": disk_size_gb,
                            "managedDisk": {
                                "storageAccountType": disk_type
                            }
                        }
                    },
                    "osProfile": {
                        "computerName": vm_name,
                        "adminUsername": admin_username,
                        "adminPassword": admin_password,
                        "linuxConfiguration": {
                            "disablePasswordAuthentication": False
                        }
                    },
                    "networkProfile": {
                        "networkInterfaces": [
                            {
                                "id": nic_id
                            }
                        ]
                    }
                }
            }
            
            if ssh_key_data:
                vm_parameters["properties"]["osProfile"]["linuxConfiguration"]["ssh"] = {
                    "publicKeys": [
                        {
                            "path": f"/home/{admin_username}/.ssh/authorized_keys",
                            "keyData": ssh_key_data
                        }
                    ]
                }
            
            if custom_data_b64:
                vm_parameters["properties"]["osProfile"]["customData"] = custom_data_b64

            vm_poller = self.compute_client.virtual_machines.begin_create_or_update(rg_name, vm_name, vm_parameters)
            
            if wait:
                while not vm_poller.done():
                    if stop_event and stop_event.is_set():
                        log(f"创建操作被取消，正在清理已创建的资源...", "WARN")
                        try:
                            self.resource_client.resource_groups.begin_delete(rg_name)
                        except Exception as ce:
                            log(f"清理资源组 {rg_name} 失败: {ce}", "WARN")
                        return False, None, "操作被取消"
                    time.sleep(2)
                vm_poller.result()
                log(f"虚拟机 {vm_name} 创建成功！", "SUCCESS")
                
                final_pip = self.network_client.public_ip_addresses.get(rg_name, f"pip-{vm_name}")
                
                result_password = admin_password
                if dd_system:
                    actual_dd_pwd = dd_password if dd_password else custom_password
                    result_password = actual_dd_pwd if actual_dd_pwd else "Ayou2Mke#65%a1"
                    log(f"注意: 系统将在后台自动进行 DD 重装，期间将断开连接，预计10-20分钟后重装完成。", "WARN")
                    log(f"DD 重装后的 root 密码将是: {result_password}", "WARN")

                return True, {
                    "vm_name": vm_name,
                    "public_ip": final_pip.ip_address,
                    "admin_username": "root" if dd_system else target_username,
                    "admin_password": result_password
                }, "创建成功"

            return True, vm_poller, "创建操作已提交"

        except Exception as e:
            log(f"创建实例失败: {str(e)}", "WARN")
            log(f"正在后台清理已创建的残留资源（资源组：{rg_name}）...", "INFO")
            try:
                self.resource_client.resource_groups.begin_delete(rg_name)
            except Exception as ce:
                log(f"清理资源组 {rg_name} 失败: {ce}", "WARN")
            raise

    def vm_action(self, action: str, resource_group: str, vm_name: str, wait=True, log_callback=None, stop_event=None):
        """对 VM 执行操作"""
        if not self.is_connected or not self.compute_client:
            raise Exception("未连接到 Azure")

        def log(msg, level="INFO"):
            if log_callback: log_callback(msg, level)
            
        action_name_map = {
            "start": "启动",
            "stop": "关机",
            "restart": "重启",
            "delete": "删除/终止"
        }
        action_cn = action_name_map.get(action, action)

        log(f"正在发送 {action_cn} 指令给实例 {vm_name}...", "INFO")

        poller = None
        if action == 'start':
            poller = self.compute_client.virtual_machines.begin_start(resource_group, vm_name)
        elif action == 'stop':
            poller = self.compute_client.virtual_machines.begin_deallocate(resource_group, vm_name)
        elif action == 'restart':
            poller = self.compute_client.virtual_machines.begin_restart(resource_group, vm_name)
        elif action == 'delete':
            poller = self.resource_client.resource_groups.begin_delete(resource_group)
        else:
            raise ValueError(f"不支持的操作: {action}")

        log(f"{action_cn} 指令已发送，正在等待 Azure 响应（这可能需要几分钟，请耐心等待）...", "WARN")

        if wait and poller:
            last_status = None
            wait_seconds = 0
            while not poller.done():
                if stop_event and stop_event.is_set():
                    log(f"{action_cn} 操作被中断。", "WARN")
                    return False, None, "操作被取消"
                try:
                    if action != 'delete':
                        vm_info = self.compute_client.virtual_machines.get(resource_group, vm_name, expand="instanceView")
                        if vm_info.instance_view and vm_info.instance_view.statuses:
                            display_status = [s.display_status for s in vm_info.instance_view.statuses if s.code and s.code.startswith('PowerState/')]
                            if display_status:
                                current_status = display_status[0]
                                if current_status != last_status:
                                    status_cn = current_status
                                    if "stopping" in current_status.lower(): status_cn = "正在关机 (Stopping)"
                                    elif "stopped" in current_status.lower(): status_cn = "已关机 (Stopped)"
                                    elif "starting" in current_status.lower(): status_cn = "正在启动 (Starting)"
                                    elif "running" in current_status.lower(): status_cn = "运行中 (Running)"
                                    elif "deallocating" in current_status.lower(): status_cn = "正在解除分配 (Deallocating)"
                                    elif "deallocated" in current_status.lower(): status_cn = "已解除分配 (Deallocated)"
                                    
                                    log(f"实例 {vm_name} 状态更新: {status_cn}", "INFO")
                                    last_status = current_status
                except Exception as e:
                    logging.debug(f"轮询实例 {vm_name} 状态失败: {e}")
                
                time.sleep(3)
                wait_seconds += 3
                if wait_seconds > 0 and wait_seconds % 15 == 0:
                    log(f"仍在等待 {action_cn} 操作完成 (已耗时 {wait_seconds} 秒)...", "INFO")
            
            poller.result()

        log(f"{action_cn} 操作已完成。", "SUCCESS")

        return True, None, "操作成功"

    def change_vm_ip(self, resource_group: str, vm_name: str, wait=True, log_callback=None, stop_event=None):
        """为虚拟机更换公网 IP"""
        if not self.is_connected or not self.compute_client or not self.network_client:
            raise Exception("未连接到 Azure")

        def log(msg, level="INFO"):
            if log_callback: log_callback(msg, level)

        try:
            log(f"正在为实例 {vm_name} 更换公网 IP...", "INFO")
            vm = self.compute_client.virtual_machines.get(resource_group, vm_name)
            if not vm.network_profile or not vm.network_profile.network_interfaces:
                raise Exception("虚拟机没有关联网卡")
            
            nic_id = vm.network_profile.network_interfaces[0].id
            nic_name = nic_id.split('/')[-1]
            nic = self.network_client.network_interfaces.get(resource_group, nic_name)
            
            ip_config = nic.ip_configurations[0]
            old_pip_id = ip_config.public_ip_address.id if ip_config.public_ip_address else None
            old_pip_name = old_pip_id.split('/')[-1] if old_pip_id else None

            ip_sku_name = "Standard"
            ip_allocation_method = "Static"

            if old_pip_name:
                try:
                    old_pip = self.network_client.public_ip_addresses.get(resource_group, old_pip_name)
                    if old_pip.sku and old_pip.sku.name:
                        ip_sku_name = old_pip.sku.name
                    if old_pip.public_ip_allocation_method:
                        ip_allocation_method = old_pip.public_ip_allocation_method
                except Exception as e:
                    logging.warning(f"获取旧公网 IP 属性失败: {e}")

                log("正在解绑旧的公网 IP...", "INFO")
                ip_config.public_ip_address = None
                poller = self.network_client.network_interfaces.begin_create_or_update(resource_group, nic_name, nic)
                if wait:
                    poller.result()

                log("正在删除旧的公网 IP...", "INFO")
                self.network_client.public_ip_addresses.begin_delete(resource_group, old_pip_name)

            log(f"正在创建新的公网 IP (SKU: {ip_sku_name}, 模式: {ip_allocation_method})...", "INFO")
            new_pip_name = f"{vm_name}-pip-{uuid.uuid4().hex[:8]}"
            pip_params = {
                "location": vm.location,
                "sku": {"name": ip_sku_name},
                "properties": {
                    "publicIPAllocationMethod": ip_allocation_method
                }
            }
            poller = self.network_client.public_ip_addresses.begin_create_or_update(resource_group, new_pip_name, pip_params)
            if wait:
                new_pip = poller.result()
                log(f"新公网 IP ({new_pip.ip_address}) 创建完成，准备绑定...", "INFO")
            else:
                return poller 

            log("正在绑定新的公网 IP 到实例...", "INFO")
            ip_config.public_ip_address = new_pip
            poller = self.network_client.network_interfaces.begin_create_or_update(resource_group, nic_name, nic)
            if wait:
                poller.result()
                
                final_pip = self.network_client.public_ip_addresses.get(resource_group, new_pip_name)
                final_ip_address = final_pip.ip_address if final_pip.ip_address else "分配中(可能需要VM运行)"
                log(f"为实例 {vm_name} 更换公网 IP 成功 (新 IP: {final_ip_address})。", "SUCCESS")
                return True, {"new_ip": final_ip_address}, "IP更换成功"
            else:
                return True, None, "IP更换请求已提交"
        except Exception as e:
            logging.error(f"更换 IP 失败: {e}")
            return False, None, f"更换 IP 失败: {str(e)}"