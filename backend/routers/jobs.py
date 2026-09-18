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
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Query
from sse_starlette.sse import EventSourceResponse

from services import query_orchestrator

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

        try:
            while True:
                item = await queue.get()
                if item is _SENTINEL:
                    break
                yield {"event": item["event"], "data": json.dumps(item["data"])}
        finally:
            try:
                await asyncio.wait_for(executor_future, timeout=5.0)
            except (asyncio.TimeoutError, Exception):
                pass

    return EventSourceResponse(event_generator())
