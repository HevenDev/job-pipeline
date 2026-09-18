"""
models/schemas.py — Pydantic response models for the Job Aggregator API.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import Optional

# ── API Models ──────────────────────────────────────────────────────────────

class JobListing(BaseModel):
    """A single job posting returned in the API response."""
    id: Optional[str] = Field(default=None, alias="_id")
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: Optional[bool] = None
    date_posted: Optional[str] = None
    job_url: Optional[str] = None
    site: Optional[str] = None
    matched_location: Optional[str] = None
    
    model_config = ConfigDict(populate_by_name=True)

class SiteStatus(BaseModel):
    """Per-site scraping telemetry included in every response."""
    calls: int = 0
    returned: int = 0
    errors: int = 0

class JobSearchResponse(BaseModel):
    """Top-level API response shape — kept for internal use and tooling."""
    jobs: list[JobListing]
    total: int
    source_status: dict[str, SiteStatus] = {}

class PaginatedJobsResponse(BaseModel):
    """API response for historical paginated jobs."""
    data: list[JobListing]
    total: int
    page: int
    limit: int

# ── Database Models ─────────────────────────────────────────────────────────

class JobDocument(BaseModel):
    """MongoDB: jobs collection schema."""
    dedup_key: str
    search_ids: list[str] = []
    first_seen_at: datetime
    last_seen_at: datetime
    seen_count: int = 1
    
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: Optional[bool] = None
    date_posted: Optional[str] = None
    job_url: Optional[str] = None
    site: Optional[str] = None
    matched_location: Optional[str] = None

class SearchHistoryDocument(BaseModel):
    """MongoDB: search_history collection schema."""
    search_id: str
    roles: list[str]
    locations: list[str]
    job_type: Optional[str] = None
    is_remote: Optional[bool] = None
    hours_old: Optional[int] = None
    
    started_at: datetime
    ended_at: Optional[datetime] = None
    status: str = "pending"  # pending, completed, error
    source: str = "live_stream"  # live_stream or seed_import
    
    total_matched: int = 0
    new_job_count: int = 0
    duplicate_job_count: int = 0
    matched_job_ids: list[str] = []
    cache_hit: bool = False
    cache_key: Optional[str] = None
    
    total_sites_checked: int = 0
    total_errors: int = 0
    
    source_status: dict[str, dict[str, int]] = {}

class EventLogDocument(BaseModel):
    """MongoDB: events_log collection schema."""
    search_id: str
    event_type: str # "batch", "done", "error"
    created_at: datetime
    payload: dict

