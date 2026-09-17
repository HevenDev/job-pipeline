"""
config.py — All tunable constants for the Job Aggregator backend.
No environment variables needed in this phase; edit values here directly.
"""
from __future__ import annotations

# ── Site routing ────────────────────────────────────────────────────────────
# LinkedIn is kept in a separate constant because it is hit only ONCE per
# user search (with the original role) to avoid rate-limit accumulation
# from repeated sequential calls.
LINKEDIN_SITES: list[str] = ["linkedin"]

# These sites are called for every keyword variant (sequential loop).
# Indeed explicitly claims no rate limiting; Naukri and Glassdoor are more
# tolerant than LinkedIn.
VARIANT_LOOP_SITES: list[str] = ["indeed", "naukri", "glassdoor"]

# ── Volume & time window ────────────────────────────────────────────────────
# Per-site results requested in each scrape_jobs() call.
DEFAULT_RESULTS_WANTED: int = 120

# Maximum age of postings returned, in hours (168 = 7 days).
# Can be overridden per-request via the hours_old query parameter.
DEFAULT_HOURS_OLD: int = 168
