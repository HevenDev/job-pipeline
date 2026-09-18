"""
services/event_stream.py — Core orchestrator for event stream persistence.
Unifies Live SSE and Backfill Seed importing.
"""
from __future__ import annotations

import logging
from datetime import datetime
from db import mongo
from utils import dedupe

logger = logging.getLogger(__name__)

import asyncio

async def process_stream_event(event_dict: dict, search_id: str, seen_keys: set[str], source: str = "live_stream", in_flight_tasks: list = None) -> dict | None:
    """
    Process an incoming event dictionary (batch, job_error, done).
    - Logs raw events to MongoDB.
    - Dedupes and saves jobs asynchronously.
    - Modifies the event_dict (e.g., replaces jobs with deduplicated jobs).
    - Returns the modified event_dict to be yielded to the frontend, or None if the batch is empty.
    """
    event_type = event_dict.get("event")
    data = event_dict.get("data", {})
    now = datetime.utcnow()
    
    # Fire & Forget: log event payload for debugging
    if mongo.db is not None:
        try:
            mongo.db.events_log.insert_one({
                "search_id": search_id,
                "event_type": event_type,
                "created_at": now,
                "payload": data
            })
        except Exception as e:
            logger.error(f"Failed to log event: {e}")

    if event_type == "batch":
        jobs = data.get("jobs", [])
        if not jobs:
            return event_dict
            
        # Dedupe memory batch synchronously
        unique_batch, operations, new_keys = dedupe.prepare_jobs_batch(jobs, search_id, seen_keys)
        
        # Dispatch background db write
        if operations and in_flight_tasks is not None:
            task = asyncio.create_task(dedupe.execute_bulk_upsert(operations, len(unique_batch), new_keys))
            in_flight_tasks.append(task)
            
        # We only want to yield unique jobs in the current stream context
        data["jobs"] = unique_batch
        data["count"] = len(unique_batch)
        
        if not unique_batch:
            return None # Skip yielding empty batch to frontend
            
        return event_dict
        
    elif event_type == "done":
        # Finalize logic is now handled in routers/jobs.py (to allow awaiting in_flight_tasks)
        return event_dict
        
    elif event_type == "job_error":
        return event_dict
        
    return event_dict
