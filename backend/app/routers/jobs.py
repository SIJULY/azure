"""任务中心：后台任务的查询与删除。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..auth import get_db, get_current_user
from ..db import Job, User
from ..operations import job_out, recent_activities, record_operation

router = APIRouter(prefix="/jobs", tags=["任务中心"])


def _out(j: Job, with_logs: bool = False) -> dict:
    return job_out(j, with_logs=with_logs)


@router.get("")
def list_jobs(limit: int = Query(50, le=200), db: Session = Depends(get_db), _u: User = Depends(get_current_user)):
    return recent_activities(db, limit)


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
    record_operation(db, "job_delete", f"删除任务 {job_id}", resource=job_id, operator=_u)
    return {"ok": True}
