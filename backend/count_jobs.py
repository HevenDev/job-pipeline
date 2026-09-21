import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

async def main():
    uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGO_DB_NAME", "pipeline")
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    count = await db.jobs.count_documents({})
    print(f"Total jobs: {count}")

if __name__ == "__main__":
    asyncio.run(main())
