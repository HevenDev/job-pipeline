"""
services/query_orchestrator.py — Coordinates all scrape_jobs() calls for
one user search and returns a single merged, deduplicated result set.

Strategy (fully sequential — no threads/async):

  1. Expand the user's role into keyword variants via keyword_expander.
  2. Call LinkedIn ONCE with the original role (avoids rate-limit buildup
     from repeated sequential calls on the same site).
  3. For each variant, call Indeed + Naukri + Glassdoor sequentially.
  4. Merge all results and deduplicate by job_url.
  5. Aggregate per-site telemetry into source_status for the response.

Why LinkedIn is separate:
  LinkedIn rate-limits based on total request volume in a time window,
  not concurrency.  Calling it once per variant (N times) is equivalent
  to N parallel calls from LinkedIn's perspective.  Calling it once with
  the original term keeps us within safe limits while still getting
  broad LinkedIn coverage.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import config
from models.schemas import JobSearchResponse, JobListing, SiteStatus
from services import job_fetcher
from utils import dedupe, keyword_expander

logger = logging.getLogger(__name__)


def _merge_status(
    accumulated: dict[str, dict],
    update: dict[str, dict],
) -> None:
    """Merge a single fetch()'s status counters into the running total."""
    for site, counts in update.items():
        if site not in accumulated:
            accumulated[site] = {"calls": 0, "returned": 0, "errors": 0}
        accumulated[site]["calls"]    += counts.get("calls", 0)
        accumulated[site]["returned"] += counts.get("returned", 0)
        accumulated[site]["errors"]   += counts.get("errors", 0)


def run(
    *,
    role: str,
    location: str,
    job_type: Optional[str] = None,
    is_remote: Optional[bool] = None,
    hours_old: Optional[int] = None,
) -> JobSearchResponse:
    """Execute the full sequential search and return a JobSearchResponse."""

    effective_hours_old = hours_old if hours_old is not None else config.DEFAULT_HOURS_OLD
    variants = keyword_expander.expand(role)

    logger.info(
        "Search started | role=%r location=%r variants=%s hours_old=%d",
        role,
        location,
        variants,
        effective_hours_old,
    )

    all_jobs: list[dict] = []
    accumulated_status: dict[str, dict] = {}
    t_start = time.monotonic()

    # ── Step 1: LinkedIn — called ONCE with original role ──────────────────
    logger.info("LinkedIn call | search_term=%r", role)
    linkedin_jobs, linkedin_status = job_fetcher.fetch(
        sites=config.LINKEDIN_SITES,
        search_term=role,
        location=location,
        job_type=job_type,
        is_remote=is_remote,
        hours_old=effective_hours_old,
        results_wanted=config.DEFAULT_RESULTS_WANTED,
    )
    all_jobs.extend(linkedin_jobs)
    _merge_status(accumulated_status, linkedin_status)

    # ── Step 2: Other sites — one call per keyword variant ─────────────────
    for variant in variants:
        logger.info(
            "Variant loop call | sites=%s search_term=%r",
            config.VARIANT_LOOP_SITES,
            variant,
        )
        v_jobs, v_status = job_fetcher.fetch(
            sites=config.VARIANT_LOOP_SITES,
            search_term=variant,
            location=location,
            job_type=job_type,
            is_remote=is_remote,
            hours_old=effective_hours_old,
            results_wanted=config.DEFAULT_RESULTS_WANTED,
        )
        all_jobs.extend(v_jobs)
        _merge_status(accumulated_status, v_status)

    # ── Step 3: Deduplicate ────────────────────────────────────────────────
    deduped = dedupe.by_url(all_jobs)

    elapsed = time.monotonic() - t_start
    logger.info(
        "Search complete | raw=%d deduped=%d elapsed=%.1fs",
        len(all_jobs),
        len(deduped),
        elapsed,
    )

    # ── Step 4: Build response ─────────────────────────────────────────────
    source_status = {
        site: SiteStatus(**counts)
        for site, counts in accumulated_status.items()
    }

    return JobSearchResponse(
        jobs=[JobListing(**j) for j in deduped],
        total=len(deduped),
        source_status=source_status,
    )
