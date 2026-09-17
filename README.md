# Pipeline — Job Listings Aggregator (Phase 1.5)

Search live job postings from **LinkedIn**, **Indeed**, **Naukri**, and **Glassdoor**
with dynamic keyword expansion, per-site telemetry, and deduplication.

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

# Install base dependencies
pip install "numpy>=2.0" pandas fastapi "uvicorn[standard]" python-dateutil beautifulsoup4 markdownify requests tldextract tls-client

# Install python-jobspy from GitHub (PyPI 1.1.82 has Naukri parsing bug):
pip install "git+https://github.com/speedyapply/JobSpy.git" --no-deps

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
2. Enter **Role**: `java`, **Location**: `Gurugram, India`
3. Click **Search Jobs**
4. Wait 1–3 minutes (sequential scrape across 4 sites + 5 keyword variants)
5. Check `source_status` in http://localhost:8000/docs → Try it out

---

## API reference

```
GET /api/jobs
```

| Parameter  | Type    | Required | Default | Description |
|------------|---------|----------|---------|-------------|
| `role`     | string  | ✅       | —       | Job title / keyword |
| `location` | string  | ✅       | —       | e.g. `Gurugram, India` |
| `job_type` | string  | ❌       | —       | `fulltime`, `parttime`, `internship`, `contract` |
| `is_remote`| boolean | ❌       | —       | `true` = remote only |
| `hours_old`| integer | ❌       | `168`   | Max posting age in hours (7 days default) |

**Response** includes `source_status` per site — use it to distinguish
"no jobs found" from "site was blocked":

```json
{
  "total": 312,
  "source_status": {
    "linkedin":  { "calls": 1, "returned": 87, "errors": 0 },
    "indeed":    { "calls": 5, "returned": 140, "errors": 0 },
    "naukri":    { "calls": 5, "returned": 0,  "errors": 5 },
    "glassdoor": { "calls": 5, "returned": 85, "errors": 0 }
  },
  "jobs": [...]
}
```

---

## How keyword expansion works

| User input              | Sites queried                             |
|-------------------------|-------------------------------------------|
| `java`                  | LinkedIn × 1 (original) + Indeed/Naukri/Glassdoor × 5 variants |
| `python developer`      | LinkedIn × 1 + others × 1 (no expansion — already a full title) |
| `machine learning`      | LinkedIn × 1 + others × 5 variants       |

---

## Known limitations

- **Naukri CAPTCHA (406)**: Naukri enforces reCAPTCHA on its API.
  Requests from cloud/data-centre IPs are commonly blocked regardless
  of the jobspy version. `source_status.naukri.errors` will be > 0 when
  this happens. This is a network/IP-level issue — no code change can
  fix it without proxy rotation (deferred to a later phase).
- **Response time**: Broad searches (5 variants, 4 sites) can take 1–3 minutes.
  The frontend shows an appropriate loading state.
- **No persistence**: Jobs are fetched live on every request and not stored anywhere.
- **Phase 2** will add: scheduling, Telegram/email notifications, saved searches, proxy rotation.
