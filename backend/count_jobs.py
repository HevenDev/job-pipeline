import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys

async def main():
    uri = "mongodb+srv://hevendevofficial_db_user:Pwq4rXah78IOjcRv@cluster0.ynebdey.mongodb.net/?retryWrites=true&w=majority"
    client = AsyncIOMotorClient(uri)
    db = client["Job-pipeline"]
    count = await db.jobs.count_documents({})
    print(f"Total jobs: {count}")

if __name__ == "__main__":
    asyncio.run(main())
