"""
db/cache.py — Specific caching operations using Redis.
"""
from __future__ import annotations

import json
import logging
from typing import Optional, Any
from db import redis_client

logger = logging.getLogger(__name__)

async def get_cached_search(cache_key: str) -> Optional[dict[str, Any]]:
    """Retrieve full search results from Redis cache."""
    if not redis_client.client:
        return None
    try:
        data = await redis_client.client.get(cache_key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Redis get_cached_search error: {e}")
    return None

async def set_cached_search(cache_key: str, data: dict[str, Any], ttl: int) -> None:
    """Store full search results in Redis cache."""
    if not redis_client.client:
        return
    try:
        await redis_client.client.setex(cache_key, ttl, json.dumps(data))
    except Exception as e:
        logger.error(f"Redis set_cached_search error: {e}")

async def is_job_known(dedup_key: str) -> bool:
    """Fast check if a job URL dedup_key is known in Redis."""
    if not redis_client.client:
        return False
    try:
        return await redis_client.client.sismember("known_jobs", dedup_key)
    except Exception as e:
        logger.error(f"Redis is_job_known error: {e}")
        return False

async def add_known_jobs(dedup_keys: list[str]) -> None:
    """Add new dedup_keys to the known_jobs set."""
    if not redis_client.client or not dedup_keys:
        return
    try:
        await redis_client.client.sadd("known_jobs", *dedup_keys)
    except Exception as e:
        logger.error(f"Redis add_known_jobs error: {e}")
