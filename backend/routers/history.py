"""
routers/history.py — Endpoints for viewing historical search data.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from db import mongo
from models.schemas import PaginatedJobsResponse

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

@router.get("/{search_id}/jobs", response_model=PaginatedJobsResponse)
async def get_historical_jobs(
    search_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100)
):
    """Retrieve all jobs found during a specific historical search, with pagination."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    query = {"search_ids": search_id}
    
    # Get total count
    total = await mongo.db.jobs.count_documents(query)
    
    # Get paginated data
    skip_amount = (page - 1) * limit
    cursor = mongo.db.jobs.find(query).sort("first_seen_at", -1).skip(skip_amount).limit(limit)
    
    jobs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs.append(doc)
        
    return {
        "data": jobs,
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/tags")
async def get_history_tags():
    """Aggregate unique roles and locations from all search history."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    # Get distinct roles
    roles = await mongo.db.search_history.distinct("roles")
    # Get distinct locations
    locations = await mongo.db.search_history.distinct("locations")
    
    # Clean up empty strings or nulls if any
    roles = sorted(list(set([r for r in roles if r])))
    locations = sorted(list(set([l for l in locations if l])))
    
    return {
        "roles": roles,
        "locations": locations
    }

@router.get("/all_jobs", response_model=PaginatedJobsResponse)
async def get_all_jobs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    role: Optional[str] = None,
    location: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Retrieve all jobs globally with advanced filtering and pagination."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
        
    query = {}
    
    # 1. Title/Role text match (using regex for flexibility on 'title')
    if role:
        roles = [r.strip() for r in role.split(',') if r.strip()]
        if roles:
            query["$or"] = [{"title": {"$regex": r, "$options": "i"}} for r in roles]
        
    # 2. Location match
    if location:
        locations = [l.strip() for l in location.split(',') if l.strip()]
        if locations:
            # If $or already exists from role, we must use $and to combine them
            loc_query = [{"location": {"$regex": l, "$options": "i"}} for l in locations]
            if "$or" in query:
                query["$and"] = [{"$or": query.pop("$or")}, {"$or": loc_query}]
            else:
                query["$or"] = loc_query
        
    # 3. Date filtering based on date_posted (YYYY-MM-DD string format)
    if start_date or end_date:
        date_query = {}
        if start_date:
            try:
                date_obj = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                date_query["$gte"] = date_obj.strftime("%Y-%m-%d")
            except ValueError:
                pass
        if end_date:
            try:
                date_obj = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                date_query["$lte"] = date_obj.strftime("%Y-%m-%d")
            except ValueError:
                pass
        if date_query:
            query["date_posted"] = date_query
            
    # Get total count
    total = await mongo.db.jobs.count_documents(query)
    
    # Get paginated data
    skip_amount = (page - 1) * limit
    cursor = mongo.db.jobs.find(query).sort("first_seen_at", -1).skip(skip_amount).limit(limit)
    
    jobs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs.append(doc)
        
    return {
        "data": jobs,
        "total": total,
        "page": page,
        "limit": limit
    }
