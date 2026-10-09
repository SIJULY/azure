"""Azure Panel 后端入口（单用户版）。"""
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .config import API_PREFIX, BASE_DIR
from .db import init_db
from .auth import ensure_admin  # noqa: E402  (ensure_admin 在 init_db 之后调用)
from .routers import auth, accounts, overview, resource_groups, vms, firewall, billing, quotas, foundry, scripts, proxies, jobs, tokens

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Azure Panel API", version="1.0.0", docs_url=f"{API_PREFIX}/docs", openapi_url=f"{API_PREFIX}/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
ensure_admin()

for r in (auth, accounts, overview, resource_groups, vms, firewall, billing, quotas, foundry, scripts, proxies, jobs, tokens):
    app.include_router(r.router, prefix=API_PREFIX)


@app.get(f"{API_PREFIX}/health")
def health():
    return {"ok": True}


# ---- 前端静态托管（生产）：dist 不存在时跳过，不影响纯 API 模式 ----
# 项目布局：<repo>/backend/app/main.py，dist 在 <repo>/frontend/dist；
# Docker 镜像内：/app/app/main.py，dist 在 /app/frontend/dist。两种都兼容。
_DIST_CANDIDATES = [BASE_DIR.parent / "frontend" / "dist", BASE_DIR / "frontend" / "dist"]
_DIST = next((p for p in _DIST_CANDIDATES if p.is_dir()), None)
if _DIST is not None:
    _assets = _DIST / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(str(_DIST / "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        # /api/* 已被上面的路由接管，这里只处理前端路由
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_DIST / "index.html"))
else:

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse(url=f"{API_PREFIX}/docs")
