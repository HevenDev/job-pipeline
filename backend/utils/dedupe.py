"""
utils/dedupe.py — Deduplicate a flat list of job dicts by job_url.

Keeps the first occurrence of each URL (case-insensitive, stripped).
Jobs with a missing or blank job_url are retained as-is (not dropped)
but are never deduplicated against each other.
"""
from __future__ import annotations


def by_url(jobs: list[dict]) -> list[dict]:
    """Return a new list with duplicate job_url entries removed."""
    seen: set[str] = set()
    out: list[dict] = []

    for job in jobs:
        raw_url = job.get("job_url") or ""
        key = raw_url.strip().lower()

        if not key:
            # No URL — keep it, can't deduplicate
            out.append(job)
            continue

        if key not in seen:
            seen.add(key)
            out.append(job)
        # else: duplicate — silently drop

    return out
