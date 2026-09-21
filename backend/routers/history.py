"""
routers/history.py - Endpoints for viewing historical search data.
"""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Query
from db import mongo
from models.schemas import PaginatedJobsResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


async def ensure_indexes() -> None:
    """Create indexes needed for history filtering and aggregation."""
    if mongo.db is None:
        return
    jobs = mongo.db.jobs
    sh = mongo.db.search_history
    try:
        await jobs.create_index([("title_norm", 1)], background=True)
        await jobs.create_index([("location_norm", 1)], background=True)
        await jobs.create_index([("company_norm", 1)], background=True)
        await jobs.create_index([("search_ids", 1)], background=True)
        await jobs.create_index([("date_posted", -1), ("_id", -1)], background=True)
        await sh.create_index([("created_at", -1)], background=True)
        logger.info("history indexes ensured")
    except Exception as exc:
        logger.warning("ensure_indexes failed (non-fatal): %s", exc)


async def backfill_norm_fields() -> None:
    """
    One-off backfill: set title_norm, location_norm, company_norm on existing docs.
    Runs at startup; safe to call repeatedly (no-ops once docs are patched).
    """
    if mongo.db is None:
        return
    query = {"$or": [
        {"title_norm": {"$exists": False}},
        {"location_norm": {"$exists": False}},
        {"company_norm": {"$exists": False}},
    ]}
    total = await mongo.db.jobs.count_documents(query)
    if total == 0:
        logger.info("backfill_norm_fields: nothing to backfill")
        return
    logger.info("backfill_norm_fields: patching %d docs...", total)
    cursor = mongo.db.jobs.find(query, {"_id": 1, "title": 1, "location": 1, "company": 1})
    from pymongo import UpdateOne as PU
    ops = []
    async for doc in cursor:
        def norm(v):
            s = (v or "").strip().lower()
            return s if s else None
        ops.append(PU({"_id": doc["_id"]}, {"$set": {
            "title_norm": norm(doc.get("title")),
            "location_norm": norm(doc.get("location")),
            "company_norm": norm(doc.get("company")),
        }}))
        if len(ops) >= 500:
            await mongo.db.jobs.bulk_write(ops, ordered=False)
            ops = []
    if ops:
        await mongo.db.jobs.bulk_write(ops, ordered=False)
    logger.info("backfill_norm_fields: done")


@router.get("/recent")
async def get_recent_searches():
    """Last 3 search_history docs by created_at desc, with job_count per search."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$limit": 3},
        {"$lookup": {
            "from": "jobs",
            "let": {"sid": "$search_id"},
            "pipeline": [
                {"$match": {"$expr": {"$in": ["$$sid", "$search_ids"]}}},
                {"$count": "n"},
            ],
            "as": "_job_count_arr",
        }},
        {"$addFields": {"job_count": {"$ifNull": [{"$arrayElemAt": ["$_job_count_arr.n", 0]}, 0]}}},
        {"$project": {"_job_count_arr": 0}},
    ]
    docs = []
    async for doc in mongo.db.search_history.aggregate(pipeline):
        doc["_id"] = str(doc["_id"])
        docs.append(doc)
    return {"recent": docs}


@router.get("/options")
async def get_filter_options(
    q: Optional[str] = Query(None, description="Typeahead filter"),
    search_id: Optional[str] = Query(None, description="Scope options to one batch"),
):
    """
    Aggregate unique titles, locations, and companies from the jobs collection.
    Returns {roles, locations, companies} each as [{value, label, count}].
    Caps at 200 each by frequency. Supports ?q= (safe regex) and ?search_id=.
    """
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
    if search_id:
        try:
            ObjectId(search_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=422, detail="Invalid search_id format")

    match_doc: dict = {}
    if search_id:
        match_doc["search_ids"] = search_id

    def build_pipeline(norm_field: str, display_field: str, q_val: Optional[str]) -> list:
        stages: list = []
        if match_doc:
            stages.append({"$match": match_doc})
        if q_val:
            safe_q = re.escape(q_val.strip())
            stages.append({"$match": {norm_field: {"$regex": safe_q, "$options": "i"}}})
        stages += [
            {"$match": {norm_field: {"$ne": None, "$exists": True}}},
            {"$group": {"_id": f"${norm_field}", "count": {"$sum": 1}, "label": {"$first": f"${display_field}"}}},
            {"$sort": {"count": -1}},
            {"$limit": 200},
            {"$project": {"_id": 0, "value": "$_id", "label": "$label", "count": "$count"}},
        ]
        return stages

    titles_raw, locations_raw, companies_raw = await asyncio.gather(
        mongo.db.jobs.aggregate(build_pipeline("title_norm", "title", q)).to_list(200),
        mongo.db.jobs.aggregate(build_pipeline("location_norm", "location", q)).to_list(200),
        mongo.db.jobs.aggregate(build_pipeline("company_norm", "company", q)).to_list(200),
    )

    return {
        "roles": sorted(titles_raw, key=lambda x: (x.get("label") or "").lower()),
        "locations": sorted(locations_raw, key=lambda x: (x.get("label") or "").lower()),
        "companies": sorted(companies_raw, key=lambda x: (x.get("label") or "").lower()),
    }


@router.get("/all_jobs", response_model=PaginatedJobsResponse)
async def get_all_jobs(
    offset: Optional[int] = Query(None, ge=0),
    limit: int = Query(25, ge=1, le=100),
    page: int = Query(1, ge=1),
    roles: list[str] = Query(default=[]),
    locations: list[str] = Query(default=[]),
    companies: list[str] = Query(default=[]),
    search_id: Optional[str] = Query(None),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    searched_start_date: Optional[str] = None,
    searched_end_date: Optional[str] = None,
    role: Optional[str] = None,
    location: Optional[str] = None,
    company: Optional[str] = None,
):
    """
    Retrieve all jobs globally with filtering, offset-based pagination.
    Sort: date_posted DESC, _id DESC (deterministic for Load More).
    """
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
    if search_id:
        try:
            ObjectId(search_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=422, detail="Invalid search_id format")

    conditions = []

    all_roles = list(roles)
    if role:
        all_roles += [r.strip() for r in role.split(",") if r.strip()]
    if all_roles:
        norms = list({r.strip().lower() for r in all_roles if r.strip()})
        if norms:
            conditions.append({"title_norm": {"$in": norms}})

    all_locations = list(locations)
    if location:
        all_locations += [l.strip() for l in location.split(",") if l.strip()]
    if all_locations:
        norms = list({l.strip().lower() for l in all_locations if l.strip()})
        if norms:
            conditions.append({"location_norm": {"$in": norms}})

    all_companies = list(companies)
    if company:
        all_companies += [c.strip() for c in company.split(",") if c.strip()]
    if all_companies:
        norms = list({c.strip().lower() for c in all_companies if c.strip()})
        if norms:
            conditions.append({"company_norm": {"$in": norms}})

    if search_id:
        conditions.append({"search_ids": search_id})

    if start_date or end_date:
        date_query: dict = {}
        if start_date:
            try:
                ds = start_date if len(start_date) == 10 else datetime.fromisoformat(start_date.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                date_query["$gte"] = ds
            except ValueError:
                pass
        if end_date:
            try:
                de = end_date if len(end_date) == 10 else datetime.fromisoformat(end_date.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                date_query["$lte"] = de
            except ValueError:
                pass
        if date_query:
            conditions.append({"date_posted": date_query})

    if searched_start_date or searched_end_date:
        seen_query: dict = {}
        if searched_start_date:
            try:
                d = (datetime.strptime(searched_start_date, "%Y-%m-%d") if len(searched_start_date) == 10
                     else datetime.fromisoformat(searched_start_date.replace("Z", "+00:00")))
                seen_query["$gte"] = d.replace(hour=0, minute=0, second=0, microsecond=0)
            except ValueError:
                pass
        if searched_end_date:
            try:
                d = (datetime.strptime(searched_end_date, "%Y-%m-%d") if len(searched_end_date) == 10
                     else datetime.fromisoformat(searched_end_date.replace("Z", "+00:00")))
                seen_query["$lte"] = d.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                pass
        if seen_query:
            conditions.append({"$or": [{"first_seen_at": seen_query}, {"created_at": seen_query}]})

    query = {"$and": conditions} if conditions else {}
    skip_amount = offset if offset is not None else (page - 1) * limit
    total = await mongo.db.jobs.count_documents(query)
    cursor = mongo.db.jobs.find(query).sort([("date_posted", -1), ("_id", -1)]).skip(skip_amount).limit(limit)
    jobs_list = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs_list.append(doc)
    has_more = (skip_amount + len(jobs_list)) < total
    return {"data": jobs_list, "total": total, "offset": skip_amount, "limit": limit, "has_more": has_more, "page": page}


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
async def get_historical_jobs(search_id: str, page: int = Query(1, ge=1), limit: int = Query(25, ge=1, le=100)):
    """Retrieve all jobs for a specific historical search, with pagination."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
    query = {"search_ids": search_id}
    total = await mongo.db.jobs.count_documents(query)
    skip_amount = (page - 1) * limit
    cursor = mongo.db.jobs.find(query).sort([("date_posted", -1), ("_id", -1)]).skip(skip_amount).limit(limit)
    jobs_list = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs_list.append(doc)
    return {"data": jobs_list, "total": total, "offset": skip_amount, "limit": limit,
            "has_more": (skip_amount + len(jobs_list)) < total, "page": page}


@router.get("/tags")
async def get_history_tags():
    """Backwards-compat wrapper - delegates to get_filter_options()."""
    if mongo.db is None:
        raise HTTPException(status_code=503, detail="Database not connected")
    result = await get_filter_options()
    return {
        "roles": [r["label"] for r in result["roles"] if r.get("label")],
        "locations": [l["label"] for l in result["locations"] if l.get("label")],
    }