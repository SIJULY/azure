# ---- Stage 1: 构建前端 ----
FROM node:20-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: 后端 + 前端产物 ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    ADMIN_USERNAME=admin

WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# 前端产物放到后端约定的位置：<BASE_DIR>/frontend/dist（BASE_DIR=/app）
COPY --from=frontend-build /build/frontend/dist ./frontend/dist

VOLUME ["/data"]
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
