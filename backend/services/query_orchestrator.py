"""
services/query_orchestrator.py — Generator that streams scrape_jobs() results
for one user search, yielding one SSE event dict per scrape_jobs() call.

Strategy (fully sequential — no threads/async):

  LinkedIn (ONCE per tag × per user-supplied location):
    For each role tag and each user-supplied location string, call LinkedIn
    once.  LinkedIn is NOT further multiplied by NCR-expanded cities — the
    geographic search is fuzzy enough to cover the wider area.

  Indeed + Naukri per tag × expanded city × spelling variant:
    For each role tag and each city in the NCR-expanded list (which is the
    union of all individual user location tags, each expanded independently),
    make one scrape_jobs() call per spelling variant.

  Glassdoor per tag × expanded city (one call, Glassdoor-safe spelling):
    Exactly one call per tag×city, using GLASSDOOR_CITY_SPELLING.

  Location expansion (per user-supplied location tag):
    Single-city NCR match  → full NCR_CLUSTER (5 cities)
    CITY_SPELLING_VARIANTS → canonical form, then NCR check
    Anything else          → treated as a single opaque city

  Deduplication:
    A single seen_urls set is maintained for the lifetime of one stream()
    call.  Cross-request dedup (across Load More) is the frontend's job.

  Yielded event shapes:
    {"event": "batch",     "data": {"jobs": [...], "tag": str, "city": str,
                                    "sites": [...], "count": int}}
    {"event": "job_error", "data": {"source": str, "message": str}}
    {"event": "done",      "data": {"total": int}}
"""
from __future__ import annotations

import logging
import re
import time
from typing import Generator, Optional

import config
from services import job_fetcher

logger = logging.getLogger(__name__)


# ── Location helpers ────────────────────────────────────────────────────────

def _resolve_cities(location: str) -> list[str]:
    """Expand one user-supplied location tag into a list of cities to query.

    - NCR city (any spelling) → full NCR_CLUSTER
    - Otherwise               → [canonical form of the city]
    """
    loc = location.strip()
    loc_lower = loc.lower()

    cluster_lower: dict[str, str] = {c.lower(): c for c in config.NCR_CLUSTER}
    variant_keys: set[str] = set(config.CITY_SPELLING_VARIANTS.keys())

    # Direct NCR match
    if loc_lower in cluster_lower:
        logger.info("Location %r → NCR cluster (%d cities)", loc, len(config.NCR_CLUSTER))
        return list(config.NCR_CLUSTER)

    # Spelling-variant key (e.g. user typed "Gurgaon" which maps to "Gurugram")
    if loc_lower in variant_keys:
        canonical = config.CITY_SPELLING_VARIANTS[loc_lower][0]
        if canonical.lower() in cluster_lower:
            logger.info("Location %r (alias %r) → NCR cluster", loc, canonical)
            return list(config.NCR_CLUSTER)
        logger.info("Location %r → canonical %r", loc, canonical)
        return [canonical]

    # Opaque city (Bangalore, London, etc.)
    return [loc]


def _all_cities(locations: list[str]) -> list[str]:
    """Union of _resolve_cities() for every user-supplied location tag,
    preserving order and removing duplicates."""
    seen: set[str] = set()
    out: list[str] = []
    for loc in locations:
        for city in _resolve_cities(loc):
            if city not in seen:
                seen.add(city)
                out.append(city)
    return out


def _spelling_variants(city: str) -> tuple[str, list[str]]:
    """Return (canonical_name, [spelling1, spelling2, ...]) for a city."""
    key = city.strip().lower()
    variants = config.CITY_SPELLING_VARIANTS.get(key)
    if variants:
        return variants[0], variants
    return city.strip(), [city.strip()]


def _glassdoor_city(city: str) -> str:
    """Return the Glassdoor-safe spelling for a city."""
    key = city.strip().lower()
    if key in config.GLASSDOOR_CITY_SPELLING:
        return config.GLASSDOOR_CITY_SPELLING[key]
    canonical, _ = _spelling_variants(city)
    return canonical


# ── Main generator ──────────────────────────────────────────────────────────

def stream(
    *,
    roles: list[str],
    locations: list[str],
    job_type: Optional[str] = None,
    is_remote: Optional[bool] = None,
    hours_old: Optional[int] = None,
    offset: int = 0,
) -> Generator[dict, None, None]:
    """Yield SSE event dicts for each scrape_jobs() call.

    Never raises — individual failures are emitted as ``job_error`` events.
    """
    effective_hours_old = hours_old if hours_old is not None else config.DEFAULT_HOURS_OLD
    cities = _all_cities(locations)

    sites_without_glassdoor = [s for s in config.VARIANT_LOOP_SITES if s != "glassdoor"]
    glassdoor_sites = ["glassdoor"] if "glassdoor" in config.VARIANT_LOOP_SITES else []

    # Pre-compute call count for the INFO log
    variant_calls_per_tag = sum(len(_spelling_variants(c)[1]) for c in cities)
    gd_calls_per_tag = len(cities) if glassdoor_sites else 0
    li_calls_per_tag = len(locations)   # LinkedIn: once per tag × per user location
    total_calls = len(roles) * (
        li_calls_per_tag
        + (variant_calls_per_tag if sites_without_glassdoor else 0)
        + gd_calls_per_tag
    )

    logger.info(
        "Search started | tags=%s locations=%s expanded_cities=%s offset=%d "
        "hours_old=%d total_scrape_calls=%d "
        "(LinkedIn=%d, Indeed+Naukri=%d, Glassdoor=%d per tag)",
        roles, locations, cities, offset, effective_hours_old, total_calls,
        len(roles) * li_calls_per_tag,
        len(roles) * (variant_calls_per_tag if sites_without_glassdoor else 0),
        len(roles) * gd_calls_per_tag,
    )

    grand_total: int = 0
    t_start = time.monotonic()

    for tag in roles:

        # ── LinkedIn — once per tag × per user-supplied location ─────────────
        for loc in locations:
            logger.info("LinkedIn call | tag=%r location=%r", tag, loc)
            try:
                li_jobs, _ = job_fetcher.fetch(
                    sites=config.LINKEDIN_SITES,
                    search_term=tag,
                    location=loc,
                    matched_location=loc,
                    job_type=job_type,
                    is_remote=is_remote,
                    hours_old=effective_hours_old,
                    results_wanted=config.DEFAULT_RESULTS_WANTED,
                    offset=offset,
                )
                new_jobs = li_jobs  # No longer filtering here
                grand_total += len(new_jobs)
                yield {"event": "batch", "data": {
                    "jobs": new_jobs, "tag": tag, "city": loc,
                    "sites": config.LINKEDIN_SITES, "count": len(new_jobs),
                }}
            except Exception as exc:
                logger.exception("LinkedIn error | tag=%r location=%r", tag, loc)
                yield {"event": "job_error", "data": {"source": "linkedin", "message": str(exc)}}

        # ── Indeed + Naukri + Glassdoor — per tag × expanded city ────────────
        for city in cities:
            canonical, spellings = _spelling_variants(city)
            gd_city = _glassdoor_city(city)

            # Indeed + Naukri: one call per spelling variant
            if sites_without_glassdoor:
                for spelling in spellings:
                    logger.info(
                        "Indeed+Naukri call | sites=%s tag=%r city=%r spelling=%r",
                        sites_without_glassdoor, tag, canonical, spelling,
                    )
                    try:
                        v_jobs, _ = job_fetcher.fetch(
                            sites=sites_without_glassdoor,
                            search_term=tag,
                            location=spelling,
                            matched_location=canonical,
                            job_type=job_type,
                            is_remote=is_remote,
                            hours_old=effective_hours_old,
                            results_wanted=config.DEFAULT_RESULTS_WANTED,
                            offset=offset,
                        )
                        new_jobs = v_jobs  # No longer filtering here
                        grand_total += len(new_jobs)
                        yield {"event": "batch", "data": {
                            "jobs": new_jobs, "tag": tag, "city": canonical,
                            "sites": sites_without_glassdoor, "count": len(new_jobs),
                        }}
                    except Exception as exc:
                        logger.exception(
                            "Indeed+Naukri error | sites=%s tag=%r spelling=%r",
                            sites_without_glassdoor, tag, spelling,
                        )
                        yield {"event": "job_error", "data": {
                            "source": ", ".join(sites_without_glassdoor), "message": str(exc),
                        }}

            # Glassdoor: one call per city, Glassdoor-safe spelling
            if glassdoor_sites:
                logger.info(
                    "Glassdoor call | tag=%r canonical=%r glassdoor_spelling=%r",
                    tag, canonical, gd_city,
                )
                try:
                    gd_jobs, _ = job_fetcher.fetch(
                        sites=glassdoor_sites,
                        search_term=tag,
                        location=gd_city,
                        matched_location=canonical,
                        job_type=job_type,
                        is_remote=is_remote,
                        hours_old=effective_hours_old,
                        results_wanted=config.DEFAULT_RESULTS_WANTED,
                        offset=offset,
                    )
                    new_jobs = gd_jobs  # No longer filtering here
                    grand_total += len(new_jobs)
                    yield {"event": "batch", "data": {
                        "jobs": new_jobs, "tag": tag, "city": canonical,
                        "sites": glassdoor_sites, "count": len(new_jobs),
                    }}
                except Exception as exc:
                    logger.exception("Glassdoor error | tag=%r city=%r", tag, gd_city)
                    yield {"event": "job_error", "data": {"source": "glassdoor", "message": str(exc)}}

    elapsed = time.monotonic() - t_start
    logger.info(
        "Search complete | tags=%s locations=%s grand_total=%d elapsed=%.1fs",
        roles, locations, grand_total, elapsed,
    )
    yield {"event": "done", "data": {"total": grand_total}}


def _filter_seen(jobs: list[dict], seen_urls: set[str]) -> list[dict]:
    # Deprecated: Filtering moved to services/event_stream.py
    pass

