# ── Stage 1: Build Frontend (React + Vite + TypeScript) ──────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/client

# Copy package files and install dependencies
COPY client/package*.json ./
RUN npm ci || npm install

# Copy frontend source code and build production assets
COPY client/ ./
RUN npm run build

# ── Stage 2: Production Python Backend Runtime ────────────────────────────────
FROM python:3.11-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/backend/static

# Install build dependencies required by JobSpy and C-extensions (regex)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -U pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY backend/ ./

# Copy compiled frontend dist from Stage 1 into the backend static folder
COPY --from=frontend-builder /app/client/dist /app/backend/static

# Render dynamically injects $PORT (defaults to 8000 for local runs)
EXPOSE 8000

# Start Uvicorn bound to 0.0.0.0 and dynamically respect $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
