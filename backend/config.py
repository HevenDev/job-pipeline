"""
config.py — All tunable constants and environment configuration.
Loads from .env if present.
"""
from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()  # load environment variables from .env

# ── Database & Cache Config ──────────────────────────────────────────────────
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "pipeline")
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

SEARCH_CACHE_TTL_SECONDS: int = int(os.getenv("SEARCH_CACHE_TTL_SECONDS", "1800"))
EVENTS_LOG_TTL_DAYS: int = int(os.getenv("EVENTS_LOG_TTL_DAYS", "60"))
BULK_WRITE_BATCH_FLUSH: str = os.getenv("BULK_WRITE_BATCH_FLUSH", "per_event") # per_event | per_n_jobs | end_of_run

# ── Site routing ────────────────────────────────────────────────────────────
# LinkedIn is kept in a separate constant because it is hit only ONCE per
# role tag (not per city) to avoid rate-limit accumulation from repeated
# sequential calls on the same site.
LINKEDIN_SITES: list[str] = ["linkedin"]

# These sites are called for every tag × city combination (sequential loop).
# Indeed explicitly claims no rate limiting; Naukri and Glassdoor are more
# tolerant than LinkedIn.
VARIANT_LOOP_SITES: list[str] = ["indeed", "naukri", "glassdoor"]

# ── Volume & time window ────────────────────────────────────────────────────
# Per-site results requested in each scrape_jobs() call.
DEFAULT_RESULTS_WANTED: int = 120

# Maximum age of postings returned, in hours (168 = 7 days).
# Can be overridden per-request via the hours_old query parameter.
DEFAULT_HOURS_OLD: int = 168

# ── City spelling variants ──────────────────────────────────────────────────
CITY_SPELLING_VARIANTS: dict[str, list[str]] = {
    "gurugram": ["Gurugram", "Gurgaon"],
    "gurgaon":  ["Gurugram", "Gurgaon"],
    "bengaluru": ["Bengaluru", "Bangalore"],
    "bangalore": ["Bengaluru", "Bangalore"],
    "bombay":   ["Mumbai", "Bombay"],
    "mumbai":   ["Mumbai", "Bombay"],
}

GLASSDOOR_CITY_SPELLING: dict[str, str] = {
    "gurugram": "Gurgaon",
    "gurgaon":  "Gurgaon",
    "bengaluru": "Bangalore",
    "bangalore": "Bangalore",
    "bombay":   "Mumbai",
    "mumbai":   "Mumbai",
}

# ── NCR cluster ─────────────────────────────────────────────────────────────
NCR_CLUSTER: list[str] = ["Gurugram", "Noida", "Delhi", "Ghaziabad", "Faridabad"]
