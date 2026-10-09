"""防火墙：NSG（网络安全组）规则的查看 / 添加 / 删除。列表带 60 秒缓存。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import User
from ..azure_svc import get_manager, proxy_env, call_with_timeout, cached, cache_invalidate

router = APIRouter(prefix="/firewall", tags=["防火墙"])


class NsgRuleIn(BaseModel):
    account_id: int
    resource_group: str
    nsg_name: str
    name: str
    priority: int = 1000
    direction: str = "Inbound"      # Inbound | Outbound
    access: str = "Allow"           # Allow | Deny
    protocol: str = "Tcp"           # Tcp | Udp | Esp | Ah | *
    src_prefix: str = "*"
    src_port: str = "*"
    dst_port: str = "22"
    description: str = ""


class NsgRuleDel(BaseModel):
    account_id: int
    resource_group: str
    nsg_name: str
    rule_name: str


def _rule_out(r) -> dict:
    def _enum(v):
        # Azure SDK 枚举转字符串：取 .value，失败则 str 后取最后一段
        val = getattr(v, "value", v)
        s = str(val)
        # 处理 "SecurityRuleDirection.INBOUND" 这类
        if "." in s:
            s = s.split(".")[-1]
        return s
    return {
        "name": r.name,
        "priority": r.priority,
        "direction": _enum(r.direction),
        "access": _enum(r.access),
        "protocol": _enum(r.protocol),
        "src_prefix": getattr(r, "source_address_prefix", "*") or "*",
        "src_port": getattr(r, "source_port_range", "*") or "*",
        "dst_port": getattr(r, "destination_port_range", "*") or "*",
        "description": getattr(r, "description", "") or "",
    }


def _do_list_nsgs(account_id: int) -> list:
    from ..azure_svc import SessionLocal
    db = SessionLocal()
    try:
        mgr, acct = get_manager(account_id, db)
    except Exception as e:
        db.close()
        raise RuntimeError(str(e))
    try:
        with proxy_env(acct):
            nsgs = call_with_timeout(
                lambda: list(mgr.network_client.network_security_groups.list_all()),
                timeout=20, timeout_msg="NSG 查询超时")
            out = []
            for nsg in nsgs:
                parts = (nsg.id or "").split("/")
                rg = parts[4] if len(parts) > 4 else ""
                out.append({
                    "name": nsg.name,
                    "resource_group": rg,
                    "location": nsg.location,
                    "rules": [_rule_out(r) for r in (nsg.security_rules or [])],
                })
            return out
    finally:
        db.close()


@cached(ttl=600)
def _cached_nsgs(account_id: int) -> list:
    return _do_list_nsgs(account_id)


@router.get("")
def list_nsgs(account_id: int = Query(...), refresh: bool = Query(False), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        if refresh:
            cache_invalidate("_cached_nsgs")
        if refresh:
            cache_invalidate("_cached_nsgs")
        return _cached_nsgs(account_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"获取 NSG 列表失败：{e}")


@router.post("/rules")
def add_rule(data: NsgRuleIn, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, acct = get_manager(data.account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    if data.direction not in ("Inbound", "Outbound"):
        raise HTTPException(400, "direction 必须为 Inbound 或 Outbound")
    if data.access not in ("Allow", "Deny"):
        raise HTTPException(400, "access 必须为 Allow 或 Deny")
    try:
        from azure.mgmt.network.models import SecurityRule
        params = SecurityRule(
            name=data.name,
            priority=data.priority,
            direction=data.direction,
            access=data.access,
            protocol=data.protocol,
            source_address_prefix=data.src_prefix,
            source_port_range=data.src_port,
            destination_address_prefix="*",
            destination_port_range=data.dst_port,
            description=data.description or None,
        )
        with proxy_env(acct):
            poller = mgr.network_client.security_rules.begin_create_or_update(
                data.resource_group, data.nsg_name, data.name, params
            )
            poller.result()
        cache_invalidate("_cached_nsgs")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, f"添加规则失败：{e}")


@router.delete("/rules")
def delete_rule(data: NsgRuleDel, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    try:
        mgr, acct = get_manager(data.account_id, db)
    except Exception as e:
        raise HTTPException(400, str(e))
    try:
        with proxy_env(acct):
            poller = mgr.network_client.security_rules.begin_delete(
                data.resource_group, data.nsg_name, data.rule_name
            )
            poller.result()
        cache_invalidate("_cached_nsgs")
        return {"ok": True}
    except Exception as e:
        raise HTTPException(400, f"删除规则失败：{e}")
