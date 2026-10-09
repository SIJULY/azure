"""任务中心：后台任务的查询与删除。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import Job, User

router = APIRouter(prefix="/jobs", tags=["任务中心"])


def _out(j: Job, with_logs: bool = False) -> dict:
    d = {
        "id": j.id, "type": j.type, "title": j.title,
        "account_id": j.account_id, "status": j.status,
        "attempts": j.attempts or 1,
        "result": j.result(),
        "created_at": j.created_at, "updated_at": j.updated_at,
        "finished_at": j.finished_at,
    }
    if with_logs:
        d["logs"] = j.logs()
    return d


@router.get("")
def list_jobs(limit: int = Query(50, le=200), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    jobs = db.query(Job).order_by(Job.created_at.desc()).limit(limit).all()
    return [_out(j) for j in jobs]


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    j = db.query(Job).filter_by(id=job_id).first()
    if not j:
        raise HTTPException(404, "任务不存在")
    return _out(j, with_logs=True)


@router.delete("/{job_id}")
def delete_job(job_id: str, db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    j = db.query(Job).filter_by(id=job_id).first()
    if not j:
        raise HTTPException(404, "任务不存在")
    db.delete(j)
    db.commit()
    return {"ok": True}
