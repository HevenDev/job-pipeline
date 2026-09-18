"""
config.py — All tunable constants for the Job Aggregator backend.
No environment variables needed in this phase; edit values here directly.
"""
from __future__ import annotations

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
# Maps the lowercased canonical/user-input city name to ALL accepted spellings.
# The FIRST entry in each list is the canonical name used for matched_location.
# Indeed + Naukri: one scrape_jobs() call per spelling variant.
# Glassdoor: one call using whichever single spelling it parses (first entry
#   that is known to work — currently the second entry for Gurugram/Gurgaon).
# Keys are lowercased; matching is always case-insensitive.
CITY_SPELLING_VARIANTS: dict[str, list[str]] = {
    "gurugram": ["Gurugram", "Gurgaon"],
    "gurgaon":  ["Gurugram", "Gurgaon"],   # user may type either spelling
    "bengaluru": ["Bengaluru", "Bangalore"],
    "bangalore": ["Bengaluru", "Bangalore"],
    "bombay":   ["Mumbai", "Bombay"],
    "mumbai":   ["Mumbai", "Bombay"],
}

# Glassdoor-safe spelling: the spelling Glassdoor's location parser accepts.
# If a city is NOT in this map, its canonical name (variants list first entry)
# is used for Glassdoor as well.
GLASSDOOR_CITY_SPELLING: dict[str, str] = {
    "gurugram": "Gurgaon",
    "gurgaon":  "Gurgaon",
    "bengaluru": "Bangalore",
    "bangalore": "Bangalore",
    "bombay":   "Mumbai",
    "mumbai":   "Mumbai",
}

# ── NCR cluster ─────────────────────────────────────────────────────────────
# If the user's location (case-insensitive) matches any city in this list,
# the search expands to query ALL cities in the cluster, not just the one
# given.  This broadens Delhi-NCR coverage without requiring the user to
# enumerate every satellite city.
NCR_CLUSTER: list[str] = ["Gurugram", "Noida", "Delhi", "Ghaziabad", "Faridabad"]
