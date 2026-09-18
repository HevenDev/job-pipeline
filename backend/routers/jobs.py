"""
routers/jobs.py — GET /api/jobs route handler.

Responsibilities:
  - Declare and validate all query parameters.
  - Delegate all business logic to query_orchestrator.stream().
  - Return a streaming EventSourceResponse (text/event-stream / SSE).

*** Critical async/sync bridge ***
query_orchestrator.stream() is a *synchronous* generator that makes
long-running blocking scrape_jobs() calls (each can take 10-60 s).
Running it directly inside an async generator would freeze the asyncio
event loop for the duration of every scrape, preventing sse-starlette
from flushing any SSE frames to the client.

Fix: the sync generator runs in a ThreadPoolExecutor via
loop.run_in_executor(). Each yielded event is put onto an asyncio.Queue
via loop.call_soon_threadsafe(). The async generator awaits items from
that queue and yields them to the SSE response immediately, keeping the
event loop free between scrapes.

SSE event names emitted:
  batch     — one batch of job listings
  job_error — a single site/combo failed; stream continues
  done      — all combinations attempted; final total count
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import AsyncGenerator, Optional, Any

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from services import query_orchestrator, event_stream
from db import mongo, cache, redis_client
import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["jobs"])

_VALID_JOB_TYPES = frozenset({"fulltime", "parttime", "internship", "contract"})
_MAX_TAGS = 6
_MAX_LOCATIONS = 5

_SENTINEL = object()  # signals end-of-stream from the producer thread


@router.get("/jobs")
async def get_jobs(
    role: list[str] = Query(..., description="One or more job title / keyword tags"),
    location: list[str] = Query(..., description="One or more city names, e.g. Gurugram, Mumbai"),
    job_type: Optional[str] = Query(None, description="fulltime | parttime | internship | contract"),
    is_remote: Optional[bool] = Query(None, description="True = remote only"),
    hours_old: Optional[int] = Query(None, ge=1, le=720),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> EventSourceResponse:
    """Stream live job postings from multiple boards as Server-Sent Events."""

    async def _err(msg: str) -> AsyncGenerator[dict, None]:
        yield {"event": "job_error", "data": json.dumps({"source": "validation", "message": msg})}
        yield {"event": "done",      "data": json.dumps({"total": 0})}

    clean_roles: list[str] = [r.strip() for r in role if r.strip()]
    if not clean_roles:
        return EventSourceResponse(_err("'role' must contain at least one non-empty tag."))
    if len(clean_roles) > _MAX_TAGS:
        return EventSourceResponse(_err(f"Too many role tags — maximum {_MAX_TAGS}."))

    clean_locations: list[str] = [l.strip() for l in location if l.strip()]
    if not clean_locations:
        return EventSourceResponse(_err("'location' must contain at least one non-empty city."))
    if len(clean_locations) > _MAX_LOCATIONS:
        return EventSourceResponse(_err(f"Too many locations — maximum {_MAX_LOCATIONS}."))

    if job_type and job_type not in _VALID_JOB_TYPES:
        return EventSourceResponse(_err(
            f"Invalid job_type '{job_type}'. Must be one of: {', '.join(sorted(_VALID_JOB_TYPES))}"
        ))

    async def event_generator() -> AsyncGenerator[dict, None]:
        # 1. Generate search ID and cache key
        search_id = str(uuid.uuid4())
        cache_key = redis_client.get_cache_key(clean_roles, clean_locations, job_type, is_remote, hours_old, offset)
        
        # 2. Check Cache
        cached = await cache.get_cached_search(cache_key)
        if cached:
            logger.info(f"Cache hit for {cache_key}")
            yield {"event": "batch", "data": json.dumps({
                "jobs": cached["jobs"], "tag": "cache", "city": "cache",
                "sites": [], "count": len(cached["jobs"])
            })}
            yield {"event": "done", "data": json.dumps({"total": len(cached["jobs"])})}
            return
            
        logger.info(f"Cache miss for {cache_key}, starting new search {search_id}")
        
        # 3. Create Search History Record
        if mongo.db is not None:
            try:
                await mongo.db.search_history.insert_one({
                    "search_id": search_id,
                    "roles": clean_roles,
                    "locations": clean_locations,
                    "job_type": job_type,
                    "is_remote": is_remote,
                    "hours_old": hours_old,
                    "started_at": datetime.utcnow(),
                    "status": "pending",
                    "source": "live_stream",
                    "total_matched": 0,
                    "new_job_count": 0,
                    "duplicate_job_count": 0,
                    "matched_job_ids": [],
                    "cache_hit": False,
                    "cache_key": cache_key,
                    "total_sites_checked": 0,
                    "total_errors": 0,
                    "source_status": {}
                })
            except Exception as e:
                logger.error(f"Failed to insert search history: {e}")
        
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def produce() -> None:
            try:
                for event_dict in query_orchestrator.stream(
                    roles=clean_roles,
                    locations=clean_locations,
                    job_type=job_type,
                    is_remote=is_remote,
                    hours_old=hours_old,
                    offset=offset,
                ):
                    loop.call_soon_threadsafe(queue.put_nowait, event_dict)
            except Exception as exc:
                logger.exception("Unhandled error in query_orchestrator.stream() thread")
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"event": "job_error", "data": {"source": "server", "message": str(exc)}},
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        executor_future = loop.run_in_executor(None, produce)
        
        seen_keys: set[str] = set()
        all_jobs: list[dict] = []
        in_flight_tasks: list = []

        try:
            while True:
                item = await queue.get()
                if item is _SENTINEL:
                    break
                    
                # Process via unified event stream handler
                processed = await event_stream.process_stream_event(item, search_id, seen_keys, source="live_stream", in_flight_tasks=in_flight_tasks)
                if not processed:
                    continue
                    
                if processed["event"] == "batch":
                    all_jobs.extend(processed["data"]["jobs"])
                    
                yield {"event": processed["event"], "data": json.dumps(processed["data"])}
        finally:
            # Await all in-flight DB writes before finalizing search history
            new_job_count = 0
            duplicate_job_count = 0
            matched_job_ids = []
            
            if in_flight_tasks:
                results = await asyncio.gather(*in_flight_tasks, return_exceptions=True)
                for res in results:
                    if isinstance(res, tuple):
                        stats, new_keys = res
                        new_job_count += stats.get("new", 0)
                        duplicate_job_count += stats.get("duplicate", 0)
                        matched_job_ids.extend(new_keys)
                        
            total_matched = len(all_jobs)
            
            # Finalize search history only if we got jobs
            if mongo.db is not None:
                if total_matched == 0:
                    # Rule 3: No empty search history
                    await mongo.db.search_history.delete_one({"search_id": search_id})
                else:
                    await mongo.db.search_history.update_one(
                        {"search_id": search_id},
                        {
                            "$set": {
                                "ended_at": datetime.utcnow(),
                                "status": "completed",
                                "total_matched": total_matched,
                                "new_job_count": new_job_count,
                                "duplicate_job_count": duplicate_job_count,
                                "matched_job_ids": list(set(matched_job_ids))
                            }
                        }
                    )
            
            # Save to cache if we got results
            if all_jobs:
                await cache.set_cached_search(cache_key, {"jobs": all_jobs}, config.SEARCH_CACHE_TTL_SECONDS)
                
            try:
                await asyncio.wait_for(executor_future, timeout=5.0)
            except (asyncio.TimeoutError, Exception):
                pass

    return EventSourceResponse(event_generator())

