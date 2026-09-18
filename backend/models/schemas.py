"""
models/schemas.py — Pydantic response models for the Job Aggregator API.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class JobListing(BaseModel):
    """A single job posting returned in the API response."""

    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: Optional[bool] = None
    date_posted: Optional[str] = None
    job_url: Optional[str] = None
    site: Optional[str] = None
    matched_location: Optional[str] = None  # city string that produced this result


class SiteStatus(BaseModel):
    """Per-site scraping telemetry included in every response.

    Helps distinguish "no jobs found" from "site silently failed"
    without surfacing raw stack traces to the client.
    """

    calls: int = 0       # total scrape_jobs() attempts targeting this site
    returned: int = 0    # total job records received from this site
    errors: int = 0      # how many calls raised an exception for this site


class JobSearchResponse(BaseModel):
    """Top-level API response shape — kept for internal use and tooling."""

    jobs: list[JobListing]
    total: int
    source_status: dict[str, SiteStatus] = {}
