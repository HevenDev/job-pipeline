"""
main.py — FastAPI application factory.

This file only:
  1. Creates the FastAPI instance
  2. Registers CORS middleware
  3. Includes the jobs router

All business logic lives in routers/, services/, utils/, and models/.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import jobs as jobs_router

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Pipeline — Job Aggregator API",
    version="1.5.0",
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
