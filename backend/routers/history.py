"""
routers/history.py — Endpoints for viewing historical search data.
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Query
from db import mongo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])

@router.get("")
async def get_search_history(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    """Retrieve historical search runs."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    cursor = mongo.db.search_history.find().sort("started_at", -1).skip(offset).limit(limit)
    records = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        records.append(doc)
        
    return {"history": records}

@router.get("/{search_id}/jobs")
async def get_historical_jobs(search_id: str):
    """Retrieve all jobs found during a specific historical search."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    # Find jobs where search_ids contains this search_id
    cursor = mongo.db.jobs.find({"search_ids": search_id}).sort("first_seen_at", -1)
    jobs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs.append(doc)
        
    return {"jobs": jobs}
