# Pipeline — Job Listings Aggregator (Phase 1)

Search live job postings from **LinkedIn**, **Indeed**, and **Naukri** in one place.

```
d:\deployed\pipeline\
├── backend/          ← FastAPI + python-jobspy
│   ├── main.py
│   └── requirements.txt
└── client/           ← React (Vite + TypeScript + Tailwind v4)
    ├── src/
    │   ├── App.tsx
    │   └── index.css
    └── vite.config.ts
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10 + |
| Node.js | 18 + |
| npm | 9 + |

---

## 1 — Backend setup

```powershell
# From the repo root
cd backend

# Create a virtual environment (recommended)
python -m venv .venv
.venv\Scripts\Activate.ps1      # Windows PowerShell
# source .venv/bin/activate     # macOS/Linux

# ⚠️  python-jobspy pins numpy==1.26.3 which has no wheel for Python 3.14+
# Install numpy/pandas first, then jobspy without its strict dependency pins:
pip install "numpy>=2.0" pandas fastapi "uvicorn[standard]"
pip install python-jobspy --no-deps

# Start the API server
uvicorn main:app --reload --port 8000
```

The backend will be available at **http://localhost:8000**.  
Interactive docs: http://localhost:8000/docs

---

## 2 — Frontend setup

```powershell
# From the repo root (new terminal)
cd client

# Install dependencies (already done if you ran npm install)
npm install

# Start the dev server
npm run dev
```

The frontend will be available at **http://localhost:5173**.

---

## 3 — Example search to verify end-to-end

1. Open http://localhost:5173
2. Enter:
   - **Role**: `Software Engineer`
   - **Location**: `Delhi, India`
   - **Job Type**: `Full-time`
   - **Work Mode**: `Any`
3. Click **Search Jobs**
4. Wait ~15–30 seconds while jobspy fetches from LinkedIn, Indeed, and Naukri
5. Real job cards should appear in the table with **View** links to the original postings

---

## API reference

```
GET /api/jobs
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `role` | string | ✅ | — | Job title / keyword |
| `location` | string | ✅ | — | City + country, e.g. `Delhi, India` |
| `job_type` | string | ❌ | — | `fulltime`, `parttime`, `internship`, `contract` |
| `is_remote` | boolean | ❌ | — | `true` = remote only, `false` = onsite/hybrid |
| `hours_old` | integer | ❌ | `72` | Only jobs posted within N hours |
| `sites` | string[] | ❌ | `linkedin,indeed,naukri` | Boards to query |

**Example curl:**
```bash
curl "http://localhost:8000/api/jobs?role=Software+Engineer&location=Delhi%2C+India&job_type=fulltime"
```

---

## Notes

- **Scraping time**: python-jobspy queries multiple sites sequentially — expect 15–30 s per search.  
- **Naukri**: May have intermittent availability depending on your network.  
- **No persistence**: Jobs are fetched fresh on every request and not stored anywhere.
- **Phase 2** will add: deduplication, scheduling, Telegram/email notifications, and saved searches.
