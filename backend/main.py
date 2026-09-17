from __future__ import annotations

import math
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from jobspy import scrape_jobs

app = FastAPI(title="Job Aggregator API", version="1.0.0")

# Allow Vite dev server (any port like 5173, 5174) and localhost origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fields to expose in the response
KEEP_FIELDS = [
    "title",
    "company",
    "location",
    "job_type",
    "is_remote",
    "date_posted",
    "job_url",
    "site",
]


def _safe_value(val):
    """Convert pandas NA / NaN / NaT to None so json.dumps is happy."""
    if val is None:
        return None
    try:
        if isinstance(val, float) and math.isnan(val):
            return None
    except TypeError:
        pass
    # pandas Timestamp → ISO string
    if hasattr(val, "isoformat"):
        return val.isoformat()
    # numpy bool_ → Python bool
    if hasattr(val, "item"):
        return val.item()
    return val


@app.get("/api/jobs")
def get_jobs(
    role: str = Query(..., min_length=1, description="Job title / keyword"),
    location: str = Query(..., min_length=1, description="Location, e.g. 'Delhi, India'"),
    job_type: Optional[str] = Query(
        None,
        description="One of: fulltime, parttime, internship, contract",
    ),
    is_remote: Optional[bool] = Query(None, description="True = remote only"),
    hours_old: int = Query(72, ge=1, le=720, description="Max age of posting in hours"),
    sites: List[str] = Query(
        ["linkedin", "indeed", "naukri"],
        description="Job boards to query",
    ),
):
    """
    Fetch live job postings via python-jobspy.
    Returns a JSON list with the key fields only.
    """
    role = role.strip()
    location = location.strip()

    if not role:
        raise HTTPException(status_code=422, detail="'role' must not be blank.")
    if not location:
        raise HTTPException(status_code=422, detail="'location' must not be blank.")

    # Validate job_type value
    valid_job_types = {"fulltime", "parttime", "internship", "contract"}
    if job_type and job_type not in valid_job_types:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid job_type '{job_type}'. Must be one of: {', '.join(sorted(valid_job_types))}",
        )

    try:
        jobs_df: pd.DataFrame = scrape_jobs(
            site_name=sites,
            search_term=role,
            location=location,
            job_type=job_type,
            is_remote=is_remote,
            hours_old=hours_old,
            results_wanted=50,
            country_indeed="India",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch jobs from job boards: {str(exc)}",
        )

    if jobs_df is None or jobs_df.empty:
        return {"jobs": [], "total": 0}

    # Keep only the fields we want (ignore missing columns gracefully)
    available = [f for f in KEEP_FIELDS if f in jobs_df.columns]
    subset = jobs_df[available].copy()

    jobs = []
    for row in subset.itertuples(index=False):
        record = {}
        for field in available:
            record[field] = _safe_value(getattr(row, field, None))
        jobs.append(record)

    return {"jobs": jobs, "total": len(jobs)}
