"""操作日志：记录面板内的账号、资源、任务、配置等用户操作。"""
import json
from typing import Any

from sqlalchemy.orm import Session

from .db import Job, OperationLog, User


def record_operation(
    db: Session,
    op_type: str,
    title: str,
    *,
    resource: str = "",
    account_id: int | None = None,
    status: str = "success",
    operator: User | str | None = None,
    detail: dict[str, Any] | None = None,
    commit: bool = True,
) -> OperationLog:
    if isinstance(operator, User):
        operator_name = operator.username
    elif isinstance(operator, str) and operator:
        operator_name = operator
    else:
        operator_name = "系统"
    rec = OperationLog(
        type=(op_type or "operation")[:64],
        title=(title or "操作")[:256],
        resource=(resource or "")[:256],
        account_id=account_id,
        status=(status or "success")[:16],
        operator=operator_name[:64],
        detail_json=json.dumps(detail or {}, ensure_ascii=False, default=str),
    )
    db.add(rec)
    if commit:
        db.commit()
        db.refresh(rec)
    return rec


def operation_out(op: OperationLog) -> dict:
    return {
        "id": f"op-{op.id}",
        "type": op.type,
        "title": op.title,
        "resource": op.resource or "",
        "account_id": op.account_id,
        "status": op.status,
        "operator": op.operator or "系统",
        "created_at": op.created_at,
        "updated_at": op.created_at,
        "finished_at": op.created_at,
        "source": "operation",
    }


def job_out(job: Job, with_logs: bool = False) -> dict:
    d = {
        "id": job.id,
        "type": job.type,
        "title": job.title,
        "resource": f"账号 #{job.account_id}" if job.account_id is not None else job.id,
        "account_id": job.account_id,
        "status": job.status,
        "operator": "系统",
        "attempts": job.attempts or 1,
        "result": job.result(),
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "finished_at": job.finished_at,
        "source": "job",
    }
    if with_logs:
        d["logs"] = job.logs()
    return d


def recent_activities(db: Session, limit: int = 50) -> list[dict]:
    safe_limit = max(1, min(int(limit or 50), 200))
    jobs = [job_out(j) for j in db.query(Job).order_by(Job.created_at.desc()).limit(safe_limit).all()]
    ops = [operation_out(o) for o in db.query(OperationLog).order_by(OperationLog.created_at.desc()).limit(safe_limit).all()]
    return sorted(jobs + ops, key=lambda x: x.get("created_at") or "", reverse=True)[:safe_limit]