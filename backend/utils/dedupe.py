"""
utils/dedupe.py - Database-aware async deduplication logic.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pymongo import UpdateOne
from db import mongo, cache
import hashlib

logger = logging.getLogger(__name__)

def generate_dedup_key(job: dict) -> str:
    """Generate a unique key for a job based on its URL or fallback properties."""
    raw_url = job.get("job_url")
    if raw_url:
        return hashlib.sha256(raw_url.strip().lower().encode()).hexdigest()
    title = str(job.get("title", "")).strip().lower()
    company = str(job.get("company", "")).strip().lower()
    location = str(job.get("location", "")).strip().lower()
    return hashlib.sha256(f"{title}|{company}|{location}".encode()).hexdigest()

def _norm(val) -> str | None:
    """Return lowercased + stripped string, or None."""
    if not val:
        return None
    return str(val).strip().lower()

def prepare_jobs_batch(jobs: list[dict], search_id: str, seen_keys: set[str]) -> tuple[list[dict], list, list[str]]:
    """Synchronously prepare a batch of jobs for upsert. Returns (unique_batch, operations, new_keys)"""
    if not jobs:
        return [], [], []
    now = datetime.utcnow()
    operations = []
    unique_batch = []
    new_keys = []
    for job in jobs:
        d_key = generate_dedup_key(job)
        if d_key in seen_keys:
            continue
        seen_keys.add(d_key)
        job["dedup_key"] = d_key
        unique_batch.append(job)
        new_keys.append(d_key)
        update_doc = {
            "$addToSet": {"search_ids": search_id},
            "$set": {"last_seen_at": now},
            "$inc": {"seen_count": 1},
            "$setOnInsert": {
                "dedup_key": d_key,
                "first_seen_at": now,
                "title": job.get("title"),
                "title_norm": _norm(job.get("title")),
                "company": job.get("company"),
                "company_norm": _norm(job.get("company")),
                "location": job.get("location"),
                "location_norm": _norm(job.get("location")),
                "job_type": job.get("job_type"),
                "is_remote": job.get("is_remote"),
                "date_posted": job.get("date_posted"),
                "job_url": job.get("job_url"),
                "site": job.get("site"),
                "matched_location": job.get("matched_location"),
            }
        }
        operations.append(UpdateOne({"dedup_key": d_key}, update_doc, upsert=True))
    return unique_batch, operations, new_keys

async def execute_bulk_upsert(operations: list, unique_batch_len: int, new_keys: list[str]) -> tuple[dict, list[str]]:
    """Execute the bulk MongoDB write asynchronously. Returns (stats, new_keys)"""
    stats = {"new": 0, "duplicate": 0}
    if not operations:
        return stats, new_keys
    if mongo.db is not None:
        try:
            result = await mongo.db.jobs.bulk_write(operations, ordered=False)
            upserted_count = len(result.upserted_ids) if result.upserted_ids else 0
            stats["new"] = upserted_count
            stats["duplicate"] = unique_batch_len - upserted_count
        except Exception as e:
            logger.error(f"MongoDB bulk_write error in execute_bulk_upsert: {e}")
    if new_keys:
        await cache.add_known_jobs(new_keys)
    return stats, new_keys