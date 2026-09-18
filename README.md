# Job Pipeline — Real-Time Job Aggregator & Master Database

A high-performance job aggregation and analytics platform that crawls and aggregates live job postings from **LinkedIn**, **Indeed**, **Naukri**, and **Glassdoor** using Server-Sent Events (SSE) streaming, deduplication, and an interactive **Master Jobs Database** with advanced range filtering.

---

## Architecture Overview

```
pipeline/
├── .gitignore                      # Root gitignore (pycache, env, build artifacts)
├── README.md
├── backend/
│   ├── main.py                     # FastAPI application factory, CORS & routers
│   ├── config.py                   # Environment configuration & tunable constants
│   ├── count_jobs.py               # Database verification & stats helper
│   ├── requirements.txt            # Python dependencies (FastAPI, Motor, JobSpy, etc.)
│   ├── db/
│   │   ├── mongo.py                # Motor async MongoDB connection & index manager
│   │   └── redis_client.py         # Redis connection for TTL caching
│   ├── models/
│   │   └── schemas.py              # Pydantic models (JobListing, SearchHistory, etc.)
│   ├── routers/
│   │   ├── jobs.py                 # GET /api/jobs (live SSE event stream)
│   │   └── history.py              # GET /api/history, /tags, /all_jobs
│   ├── services/
│   │   ├── job_fetcher.py          # JobSpy engine wrapper
│   │   ├── query_orchestrator.py   # Multi-site orchestrator, variant loop & dedup
│   │   └── event_stream.py         # SSE streaming generator
│   └── utils/
│       ├── dedupe.py               # Exact URL and fingerprint deduplication
│       └── keyword_expander.py     # Canonical city cluster and variant expansion
└── client/                         # React 19 + TypeScript + Vite + Tailwind v4
    ├── index.html
    ├── src/
    │   ├── App.tsx                 # App layout, top navigation & route switches
    │   ├── index.css               # Design system tokens & Tailwind v4 theme
    │   ├── types.ts                # TypeScript interfaces (Job, SearchHistory, etc.)
    │   ├── pages/
    │   │   ├── SearchPage.tsx      # Live aggregation dashboard with SSE stream
    │   │   └── HistoryPage.tsx     # Master database with multi-filter controls
    │   └── components/
    │       ├── DateRangePicker.tsx # Custom shadcn-style 2-month range picker
    │       ├── MultiSelect.tsx     # Debounced multi-select with search & chips
    │       ├── JobsTable.tsx       # Responsive jobs table & mobile card view
    │       ├── DatePicker.tsx      # Single date picker
    │       └── Select.tsx          # Custom select dropdown
```

---

## Key Features

### 1. Live Job Aggregation Engine
- **Multi-Platform Scrape**: Concurrently queries LinkedIn, Indeed, Naukri, and Glassdoor.
- **Server-Sent Events (SSE)**: Streams job batches directly into the UI in real-time as scrapers return results.
- **Deduplication & Canonical Normalization**: Deduplicates job listings across multiple sites using URL and company-title hashing.

### 2. Master Jobs Database & Analytics
- **Global Paginated Job Vault**: Explore and filter all historical crawled jobs.
- **Two-Month DateRangePicker**:
  - **Posted Date Range**: Filter by original job post date (`start_date`, `end_date`).
  - **Searched On Date Range**: Filter by crawl/ingestion date (`searched_start_date`, `searched_end_date`) querying `first_seen_at` and `created_at`.
  - Zero-drift `YYYY-MM-DD` URL query parameter synchronization.
- **Debounced MultiSelect**:
  - Instant UI feedback on chip/checkbox selection.
  - 350ms debounced network propagation to prevent excessive API requests.
  - Popover-close auto-flush to ensure no pending selections are dropped.
  - Integrated search input for fast filtering within large option sets.
- **Recent Searches**: Quick-filter cards to re-apply historical search parameters and date ranges in 1 click.

### 3. Modern Dark Aesthetic Design
- Electric violet primary theme (`#7c3aed`), dark charcoal canvas (`#0b0f19`), and glassmorphism panels.
- Semantic color coding for sources (Indeed: Emerald, LinkedIn: Blue, Glassdoor: Violet, Naukri: Amber).
- Fully responsive desktop table and mobile card layouts with staggered entry animations.

---

## Prerequisites

| Technology | Recommended Version | Note |
|:---|:---|:---|
| **Python** | `3.10+` | Virtual environment recommended (`.venv`) |
| **Node.js** | `18+` or `20+` | Tested on Node v20+ / v24 |
| **npm** | `9+` | Standard package manager |
| **MongoDB** | MongoDB Atlas or Local `6.0+` | Connection string set via `.env` |
| **Redis** | Optional (via Docker) | Gracefully degrades if not running |

---

## Deployment & Running with Docker (Recommended)

### 1. Local Setup via Docker Compose (App + Redis)

Using `docker-compose.yml` is the simplest way to run the entire stack locally with a single command. It spins up both **Redis** (caching on port `6379`) and the **App** (FastAPI + React UI on port `8000`), automatically reading your MongoDB Atlas credentials from `backend/.env`:

```powershell
# Build and start all services in background
docker compose up -d --build

# View real-time aggregated logs
docker compose logs -f

# Stop and tear down containers
docker compose down
```

- **Web Application UI & API**: Open **`http://localhost:8000`** in your browser.
- **Interactive Swagger Docs**: **`http://localhost:8000/docs`**
- **Redis Cache**: Accessible on port `6379` (`redis://redis:6379/0`).

---

### 2. Standalone Docker Run Commands (Alternative)

If you prefer running a single standalone container without Docker Compose:

#### Option A: Using `--env-file` (No credentials typed)
```powershell
# Build image
docker build -t job-pipeline:latest .

# Run container reading backend/.env
docker run -d -p 8000:8000 --env-file backend/.env --name job-pipeline-app job-pipeline:latest
```

#### Option B: Explicit Environment Variables

**Single-line (PowerShell / CMD / Bash):**
```powershell
docker run -d -p 8000:8000 -e MONGO_URI="YOUR_MONGODB_URI" -e MONGO_DB_NAME="Job-pipeline" --name job-pipeline-app job-pipeline:latest
```

**PowerShell Multi-line (using backtick `` ` ``):**
```powershell
docker run -d -p 8000:8000 `
  -e MONGO_URI="YOUR_MONGODB_URI" `
  -e MONGO_DB_NAME="Job-pipeline" `
  --name job-pipeline-app `
  job-pipeline:latest
```

---

### 3. Built-In Resiliency & Fallbacks

The platform is designed with automatic fallback layers to ensure 100% uptime even if secondary services are unavailable:

| Feature | Primary Mechanism | Fallback Behavior |
| :--- | :--- | :--- |
| **Redis Caching** | Connected to Redis (`REDIS_URL` or `redis://redis:6379/0`) for 30-min scrape caching | **Graceful No-Op Fallback**: If Redis is offline, unreachable, or unconfigured, the application logs a warning and proceeds without caching. Live scraping, SSE streaming, and MongoDB reads/writes continue normally with zero downtime. |
| **Frontend Routing** | Direct static asset delivery (`/assets/...`) | **SPA History Fallback**: Direct browser navigation or page refresh on client-side routes (e.g. `/` and `/history`) falls back to `index.html`. Users will never encounter a 404 on page refresh. |
| **API Integration** | Same-origin relative URLs (`/api/...`) in production | **Zero-CORS Fallback**: In the single-container build, the UI and API share the exact same host and port (`8000`). No cross-origin headers or domain routing mismatches occur. |
| **MongoDB Atlas** | Auto-indexes deduplication keys, roles, and dates on startup | **Atlas Retryable Writes**: Outbound connection uses TLS with automatic retry logic handled by Motor/PyMongo. |

---

### 4. Deploying to Render (1-Click Docker Web Service)

This repository includes a multi-stage [Dockerfile](file:///d:/deployed/pipeline/Dockerfile) and a [render.yaml](file:///d:/deployed/pipeline/render.yaml) blueprint that compiles the React frontend into static assets and serves both the frontend and FastAPI on a single port.

#### Steps to Deploy on Render:
1. Push this repository to **GitHub** or **GitLab**:
   ```bash
   git add .
   git commit -m "Deploy job-pipeline to Render"
   git push origin main
   ```
2. In the [Render Dashboard](https://dashboard.render.com/), click **New +** → **Web Service** (or select **Blueprint** to use `render.yaml`).
3. Connect your repository.
4. Render detects the `Dockerfile` automatically:
   - **Environment**: `Docker`
   - **Branch**: `main`
5. In **Environment Variables**, configure:
   - `MONGO_URI`: `YOUR_MONGODB_URI`
   - `MONGO_DB_NAME`: `Job-pipeline`
   - `REDIS_URL`: *(Optional)* Add a free Redis instance on Render (**New +** → **Redis**) or [Upstash](https://upstash.com/), or leave empty for automatic fallback.
6. Click **Deploy Web Service**!
   - Render automatically assigns a live HTTPS URL (e.g., `https://job-pipeline.onrender.com`).
   - Both the React frontend and FastAPI backend are immediately accessible on that single URL.

---

## Local Development Setup (Without Docker)

If you prefer running Python and Node directly on your host machine for development:

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment (optional)
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python -m uvicorn main:app --reload --port 8000
```
- API Base URL: **`http://localhost:8000`**
- Interactive Swagger Docs: **`http://localhost:8000/docs`**

### 2. Frontend Setup

```bash
cd client

# Install packages & start dev server
npm install
npm run dev
```
- Client runs on **`http://localhost:5173`**

To build for production:
```bash
npm run build
```

---

## API Reference

### Live Aggregation
- **`GET /api/jobs`**
  - Streams real-time job listings via Server-Sent Events (SSE).
  - Query parameters:
    - `role`: One or more job titles / keywords (e.g. `role=python&role=react`)
    - `location`: One or more target cities (e.g. `location=Gurugram&location=Delhi`)
    - `job_type`: Optional (`fulltime`, `parttime`, `internship`, `contract`)
    - `is_remote`: Optional boolean (`true` / `false`)
    - `hours_old`: Max age in hours (default: `168`)

### History & Database Endpoints
- **`GET /api/history`**
  - Returns recent search runs with aggregate statistics (`limit`, `offset`).
- **`GET /api/history/tags`**
  - Returns distinct list of historical roles and locations for autocomplete filters.
- **`GET /api/history/all_jobs`**
  - Paginated master job records with advanced filtering.
  - Query parameters:
    - `page`: Page number (default: `1`)
    - `limit`: Items per page (default: `25`, max: `100`)
    - `role`: Comma-separated role filter
    - `location`: Comma-separated location filter
    - `start_date`: Minimum posted date (`YYYY-MM-DD` or ISO string)
    - `end_date`: Maximum posted date (`YYYY-MM-DD` or ISO string)
    - `searched_start_date`: Minimum crawl/ingestion date (`YYYY-MM-DD` or ISO string)
    - `searched_end_date`: Maximum crawl/ingestion date (`YYYY-MM-DD` or ISO string)
- **`GET /api/history/{search_id}/jobs`**
  - Paginated jobs belonging to a specific search run ID.

---

## Database Management & Maintenance

### Check Job Statistics
Run the helper script to view total documents in the database:
```bash
cd backend
python count_jobs.py
```

### Clearing Python Cache (`__pycache__`)
All `__pycache__` directories and `.pyc` files are ignored by Git. If you need to wipe local compiled cache files:

**PowerShell:**
```powershell
Get-ChildItem -Path . -Filter "__pycache__" -Recurse -Directory -Force | Remove-Item -Recurse -Force
```

**Command Prompt (cmd.exe):**
```cmd
for /d /r . %d in (__pycache__) do @if exist "%d" rd /s /q "%d"
```

---

## License

Private repository developed for Hevendev.
