# Pipeline — Job Listings Aggregator (Version 2)

Search live job postings from **LinkedIn**, **Indeed**, **Naukri**, and **Glassdoor**
with real-time Server-Sent Events (SSE) streaming, multi-tag input, per-site telemetry, and deduplication.

```
d:\deployed\pipeline\
├── backend/
│   ├── main.py                     # App factory + CORS + router registration
│   ├── config.py                   # Tunable constants (sites, limits, windows)
│   ├── verify_naukri.py            # Smoke-test script for Naukri
│   ├── requirements.txt
│   ├── models/
│   │   └── schemas.py              # Pydantic: JobListing, SiteStatus, JobSearchResponse
│   ├── routers/
│   │   └── jobs.py                 # GET /api/jobs handler
│   ├── services/
│   │   ├── job_fetcher.py          # Single scrape_jobs() call wrapper
│   │   └── query_orchestrator.py  # LinkedIn×1 + variant loop + merge + dedup
│   └── utils/
│       ├── dedupe.py               # Deduplicate by job_url
│       └── keyword_expander.py    # Dynamic keyword variant generator
└── client/                         # React (Vite + TypeScript + Tailwind v4)
    └── src/App.tsx
```

---

## Prerequisites

| Tool    | Version |
|---------|---------|
| Python  | 3.10+   |
| Node.js | 18+     |
| npm     | 9+      |
| git     | any     |

---

## 1 — Backend setup

```powershell
cd backend

# Install all dependencies (including JobSpy directly from GitHub to fix Naukri parsing bug)
pip install -r requirements.txt

# Start the API server
python -m uvicorn main:app --reload --port 8000
```

API available at **http://localhost:8000**  
Swagger docs: http://localhost:8000/docs

---

## 2 — Frontend setup

```powershell
cd client
npm install
npm run dev
```

Frontend at **http://localhost:5173** (or next available port).

---

## 3 — Example search (end-to-end verification)

1. Open http://localhost:5173
2. Enter **Role**: `java` `developer` (Press Enter after each), **Location**: `Gurugram` `Delhi`
3. Click **Search Jobs**
4. The results table will populate in real-time as the stream delivers batches of scraped jobs.

---

## API reference

```
GET /api/jobs
```

| Parameter  | Type         | Required | Default | Description |
|------------|--------------|----------|---------|-------------|
| `role`     | list[string] | ✅       | —       | One or more job title / keyword tags (repeated param) |
| `location` | list[string] | ✅       | —       | One or more city names (repeated param) |
| `job_type` | string       | ❌       | —       | `fulltime`, `parttime`, `internship`, `contract` |
| `is_remote`| boolean      | ❌       | —       | `true` = remote only |
| `hours_old`| integer      | ❌       | `168`   | Max posting age in hours (7 days default) |
| `offset`   | integer      | ❌       | `0`     | Pagination offset for "Load More" |

**Response** streams Server-Sent Events (SSE). Example frames:

```json
event: batch
data: {"jobs": [...], "tag": "java", "city": "Gurugram", "sites": ["indeed"], "count": 25}

event: done
data: {"total": 25}
```

---

## How expansion works (Version 2)

| Input Location | Execution Strategy                                      |
|----------------|---------------------------------------------------------|
| `Gurugram`     | Expands to full NCR cluster (Noida, Delhi, etc).        |
| `Gurgaon`      | Uses `Gurugram` canonical name, expands to NCR cluster. |
| `Mumbai`       | Treated as a single city (no expansion).                |

Roles are queried directly as tags — `LinkedIn` gets exactly 1 call per role tag (ignoring city/spelling variants to preserve rate limits), while `Indeed`/`Naukri`/`Glassdoor` are iterated over every combination of role × city × spelling variant.

---

## Known limitations

- **Naukri CAPTCHA (406)**: Naukri enforces reCAPTCHA on its API.
  Requests from cloud/data-centre IPs are commonly blocked regardless
  of the jobspy version. `source_status.naukri.errors` will be > 0 when
  this happens. This is a network/IP-level issue — no code change can
  fix it without proxy rotation (deferred to a later phase).
- **Response time**: Broad searches across multiple tags and expanded cities can take several minutes to complete fully, but results stream in immediately as they are scraped.
- **No persistence**: Jobs are fetched live on every request and not stored anywhere. (Cross-request deduplication handles "Load More" natively).
