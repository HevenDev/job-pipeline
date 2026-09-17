"""
routers/jobs.py — GET /api/jobs route handler.

Responsibilities:
  - Declare and validate all query parameters.
  - Delegate all business logic to query_orchestrator.run().
  - Return a JobSearchResponse.

This module contains NO scraping logic — it only translates HTTP params
into a service call and maps the result to the response model.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

import config
from models.schemas import JobSearchResponse
from services import query_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["jobs"])

_VALID_JOB_TYPES = frozenset({"fulltime", "parttime", "internship", "contract"})


@router.get("/jobs", response_model=JobSearchResponse)
def get_jobs(
    role: str = Query(..., min_length=1, description="Job title or keyword"),
    location: str = Query(..., min_length=1, description="Location, e.g. 'Delhi, India'"),
    job_type: Optional[str] = Query(
        None,
        description="One of: fulltime, parttime, internship, contract",
    ),
    is_remote: Optional[bool] = Query(None, description="True = remote only"),
    hours_old: Optional[int] = Query(
        None,
        ge=1,
        le=720,
        description=(
            f"Only return postings newer than this many hours "
            f"(default: {config.DEFAULT_HOURS_OLD})"
        ),
    ),
) -> JobSearchResponse:
    """Fetch live job postings from multiple boards and return a merged,
    deduplicated result set with per-site telemetry."""

    role = role.strip()
    location = location.strip()

    if not role:
        raise HTTPException(status_code=422, detail="'role' must not be blank.")
    if not location:
        raise HTTPException(status_code=422, detail="'location' must not be blank.")
    if job_type and job_type not in _VALID_JOB_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid job_type '{job_type}'. "
                f"Must be one of: {', '.join(sorted(_VALID_JOB_TYPES))}"
            ),
        )

    try:
        return query_orchestrator.run(
            role=role,
            location=location,
            job_type=job_type,
            is_remote=is_remote,
            hours_old=hours_old,
        )
    except Exception as exc:
        logger.exception("Unhandled error in query_orchestrator.run()")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch jobs: {exc}",
        ) from exc
