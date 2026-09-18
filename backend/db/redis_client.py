"""
db/redis_client.py — Redis async client and caching utilities.
"""
from __future__ import annotations

import logging
import hashlib
import json
import redis.asyncio as redis
import config

logger = logging.getLogger(__name__)

client: redis.Redis | None = None

async def connect_redis():
    global client
    logger.info("Connecting to Redis...")
    client = redis.from_url(config.REDIS_URL, decode_responses=True)
    try:
        await client.ping()
        logger.info("Redis connected successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")

async def close_redis():
    global client
    if client:
        await client.aclose()
        logger.info("Redis connection closed.")

def get_cache_key(roles: list[str], locations: list[str], job_type: str | None, is_remote: bool | None, hours_old: int | None, offset: int) -> str:
    """Normalize query parameters into a consistent cache key."""
    # Sort lists to ensure tag order doesn't change the hash
    norm_roles = sorted([r.strip().lower() for r in roles if r.strip()])
    norm_locs = sorted([l.strip().lower() for l in locations if l.strip()])
    
    payload = {
        "roles": norm_roles,
        "locations": norm_locs,
        "job_type": job_type.strip().lower() if job_type else None,
        "is_remote": is_remote,
        "hours_old": hours_old,
        "offset": offset
    }
    
    # Stable JSON dump
    payload_str = json.dumps(payload, sort_keys=True)
    hash_str = hashlib.sha256(payload_str.encode('utf-8')).hexdigest()
    return f"search_cache:{hash_str}"
