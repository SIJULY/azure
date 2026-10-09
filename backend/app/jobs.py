"""后台任务中心：长耗时操作（建 VM、VM 动作、Foundry）在线程中执行，日志实时写入 DB。"""
import json
import logging
import threading
import uuid
from datetime import datetime
from .db import SessionLocal, Job

log = logging.getLogger("jobs")
_lock = threading.Lock()


def _now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_job(job_type: str, title: str, account_id: int | None = None) -> str:
    job_id = uuid.uuid4().hex[:12]
    s = SessionLocal()
    try:
        s.add(Job(id=job_id, type=job_type, title=title, account_id=account_id, status="pending"))
        s.commit()
    finally:
        s.close()
    return job_id


class JobLogger:
    """传给 azure_manager 的 log_callback：把日志追加到 Job 记录。"""

    def __init__(self, job_id: str):
        self.job_id = job_id

    def __call__(self, message: str, level: str = "INFO"):
        s = SessionLocal()
        try:
            job = s.query(Job).filter_by(id=self.job_id).first()
            if not job:
                return
            logs = job.logs()
            logs.append({"time": _now(), "level": level, "message": str(message)})
            job.logs_json = json.dumps(logs, ensure_ascii=False)
            s.commit()
        except Exception as e:
            log.warning("写入 job 日志失败: %s", e)
        finally:
            s.close()


def _set_status(job_id: str, status: str, result: dict | None = None):
    s = SessionLocal()
    try:
        job = s.query(Job).filter_by(id=job_id).first()
        if not job:
            return
        job.status = status
        job.updated_at = _now()
        if result is not None:
            job.result_json = json.dumps(result, ensure_ascii=False, default=str)
        if status in ("success", "failed"):
            job.finished_at = _now()
        s.commit()
    finally:
        s.close()


def run_in_background(job_id: str, fn, *args, **kwargs):
    """在守护线程中执行 fn(job_logger, *args, **kwargs)，自动更新任务状态。"""

    def _target():
        _set_status(job_id, "running")
        logger = JobLogger(job_id)
        try:
            result = fn(logger, *args, **kwargs)
            _set_status(job_id, "success", {"ok": True, "data": result} if not isinstance(result, dict) else result)
        except Exception as e:
            logger(f"任务失败：{e}", "ERROR")
            _set_status(job_id, "failed", {"ok": False, "error": str(e)})

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    return t
