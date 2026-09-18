"""
db/mongo.py — MongoDB connection and index management.
"""
from __future__ import annotations

import logging
from motor.motor_asyncio import AsyncIOMotorClient
import config

logger = logging.getLogger(__name__)

# Global client and db
client: AsyncIOMotorClient | None = None
db = None

async def connect_db():
    global client, db
    logger.info("Connecting to MongoDB...")
    client = AsyncIOMotorClient(config.MONGO_URI)
    db = client[config.MONGO_DB_NAME]
    
    # Ensure indexes
    try:
        # jobs: deduplication key must be unique
        await db.jobs.create_index("dedup_key", unique=True)
        # jobs: simple indexing for querying
        await db.jobs.create_index([("site", 1), ("date_posted", -1)])
        await db.jobs.create_index("company")
        
        # search_history: indexes for filtering
        await db.search_history.create_index("started_at")
        await db.search_history.create_index("roles")
        await db.search_history.create_index("locations")
        await db.search_history.create_index("job_type")
        
        # events_log: ttl index for auto-deletion
        await db.events_log.create_index("created_at", expireAfterSeconds=config.EVENTS_LOG_TTL_DAYS * 86400)
        await db.events_log.create_index("search_id")
        
        logger.info("MongoDB indexes verified.")
    except Exception as e:
        logger.error(f"Error creating MongoDB indexes: {e}")

async def close_db():
    global client
    if client:
        client.close()
        logger.info("MongoDB connection closed.")
