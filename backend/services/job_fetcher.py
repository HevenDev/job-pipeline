"""
services/job_fetcher.py — Thin wrapper around a single scrape_jobs() call.

Responsibilities:
  - Execute one jobspy scrape for a given search_term + site list.
  - Normalise the returned DataFrame into a plain list[dict] with only
    the fields defined in KEEP_FIELDS.
  - Attach a matched_location field to every returned job dict.
  - Track per-site call/return/error counts for source_status telemetry.
  - Never raise — on any exception the call is logged and an empty list
    is returned, so one failing site never aborts the whole orchestration.
"""
from __future__ import annotations

import logging
import math
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Only these columns are kept per job; others are dropped to keep payloads light.
KEEP_FIELDS: list[str] = [
    "title",
    "company",
    "location",
    "job_type",
    "is_remote",
    "date_posted",
    "job_url",
    "site",
]


def _safe_value(val):
    """Convert pandas NA / NaN / NaT / numpy scalars to JSON-serialisable types."""
    if val is None:
        return None
    try:
        if isinstance(val, float) and math.isnan(val):
            return None
    except TypeError:
        pass
    if hasattr(val, "isoformat"):          # pandas Timestamp → ISO string
        return val.isoformat()
    if hasattr(val, "item"):               # numpy bool_ / int64 / float64 → Python
        return val.item()
    return val


def fetch(
    *,
    sites: list[str],
    search_term: str,
    location: str,
    matched_location: str,
    job_type: Optional[str] = None,
    is_remote: Optional[bool] = None,
    hours_old: int,
    results_wanted: int,
    offset: int = 0,
) -> tuple[list[dict], dict[str, dict]]:
    """Run one scrape_jobs() call and return (jobs, site_status_update).

    ``matched_location`` is the specific city string used for this call
    (may differ from ``location`` when Glassdoor alias substitution is
    applied). It is attached to every job dict as ``matched_location``
    so the frontend can display which city produced each result.

    ``site_status_update`` is a dict keyed by site name with keys:
      calls    — always 1 per site in this call
      returned — number of records received from that site
      errors   — 1 if an exception occurred, else 0

    The caller (orchestrator) accumulates these across multiple fetch() calls.
    """
    # Initialise status counters for each site in this call
    status: dict[str, dict] = {
        s: {"calls": 1, "returned": 0, "errors": 0} for s in sites
    }

    try:
        from jobspy import scrape_jobs  # imported here so test mocking is easy

        # Build kwargs — only pass optional fields when explicitly set.
        # The GitHub jobspy branch uses strict Pydantic validation and rejects
        # None for fields typed as bool (e.g. is_remote).
        kwargs: dict = dict(
            site_name=sites,
            search_term=search_term,
            location=location,
            hours_old=hours_old,
            results_wanted=results_wanted,
            country_indeed="India",
            offset=offset,
        )
        if job_type is not None:
            kwargs["job_type"] = job_type
        if is_remote is not None:
            kwargs["is_remote"] = is_remote

        jobs_df: pd.DataFrame = scrape_jobs(**kwargs)
    except Exception as exc:
        logger.error(
            "scrape_jobs() failed | sites=%s search_term=%r location=%r: %s",
            sites,
            search_term,
            location,
            exc,
        )
        for s in sites:
            status[s]["errors"] = 1
        return [], status

    if jobs_df is None or jobs_df.empty:
        logger.info(
            "scrape_jobs() returned 0 rows | sites=%s search_term=%r location=%r",
            sites,
            search_term,
            location,
        )
        return [], status

    # Keep only desired columns (gracefully skip missing ones)
    available = [f for f in KEEP_FIELDS if f in jobs_df.columns]
    subset = jobs_df[available].copy()

    jobs: list[dict] = []
    for row in subset.itertuples(index=False):
        record: dict = {}
        for field in available:
            record[field] = _safe_value(getattr(row, field, None))
        record["matched_location"] = matched_location
        jobs.append(record)

    # Update per-site returned counts
    if "site" in jobs_df.columns:
        site_counts = jobs_df["site"].value_counts().to_dict()
        for s, count in site_counts.items():
            s_key = str(s).lower()
            if s_key in status:
                status[s_key]["returned"] = int(count)
            else:
                # site key might differ (e.g. capitalisation) — try to match
                for k in status:
                    if k in s_key or s_key in k:
                        status[k]["returned"] = int(count)
                        break
    else:
        # No site column — attribute all to first site
        if sites:
            status[sites[0]]["returned"] = len(jobs)

    logger.info(
        "scrape_jobs() OK | sites=%s search_term=%r location=%r returned=%d",
        sites,
        search_term,
        location,
        len(jobs),
    )
    return jobs, status
