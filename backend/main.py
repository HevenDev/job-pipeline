"""
main.py - FastAPI application factory.

This file only:
  1. Creates the FastAPI instance
  2. Registers CORS middleware
  3. Includes the jobs router

All business logic lives in routers/, services/, utils/, and models/.
"""
from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routers import jobs as jobs_router
from routers import history as history_router
from db import mongo, redis_client

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s - %(message)s",
    datefmt="%H:%M:%S",
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await mongo.connect_db()
    await redis_client.connect_redis()
    # Create indexes and backfill norm fields on existing jobs
    await history_router.ensure_indexes()
    await history_router.backfill_norm_fields()
    yield
    # Shutdown
    await mongo.close_db()
    await redis_client.close_redis()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Pipeline - Job Aggregator API",
    version="2.0.0",
    lifespan=lifespan,
    description=(
        "Fetches live job postings from LinkedIn, Indeed, Naukri, and Glassdoor "
        "using python-jobspy, applies dynamic keyword expansion, and returns a "
        "deduplicated result set with per-site telemetry."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow any localhost origin (handles Vite dev server on any port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(jobs_router.router)
app.include_router(history_router.router)

# ── Static Files & Single Page App (SPA) Fallback ────────────────────────────
STATIC_DIR = os.getenv("STATIC_DIR", os.path.join(os.path.dirname(__file__), "static"))
if not os.path.exists(STATIC_DIR):
    alt_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "client", "dist")
    if os.path.exists(alt_dir):
        STATIC_DIR = alt_dir

if os.path.exists(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        target_file = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
