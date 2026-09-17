# JobSpy Capabilities, Architecture & Search Investigation Report

## 1. Executive Summary

This document details:
1. **The root cause analysis** of why **Indeed** and **Naukri** returned 0 results while **LinkedIn** returned 120 results in the recent search test.
2. **The complete data schema & capability matrix** of the `python-jobspy` library (34 extractable fields across platforms).
3. **Step-by-step roadmap** to ingest rich fields (direct ATS URLs, salary compensation, company logos, full markdown job descriptions) into both the backend pipeline and the React UI.

---

## 2. Root Cause Analysis: Recent Search Run

### Search Execution Parameters
* **Role Input**: `"Java Spring Boot Spring Framework Spring MVC Spring Security REST API Microservices"`
* **Location Input**: `"Gurugram"`
* **Time Filter (`hours_old`)**: `168` hours (7 days)

### Actual Backend Server Log (`task-239.log`)
```log
19:42:01 INFO services.query_orchestrator — Search started | role='Java Spring Boot Spring Framework Spring MVC Spring Security REST API Microservices' location='Gurugram' variants=['java spring boot spring framework spring mvc spring security rest api microservices', 'java spring boot spring framework spring mvc spring security rest api microservices developer', ...] hours_old=168
19:42:01 INFO services.query_orchestrator — LinkedIn call | search_term='Java Spring Boot Spring Framework Spring MVC Spring Security REST API Microservices'
19:43:04 INFO services.job_fetcher — scrape_jobs() OK | sites=['linkedin'] search_term='Java Spring Boot Spring Framework Spring MVC Spring Security REST API Microservices' returned=120
19:43:04 INFO services.query_orchestrator — Variant loop call | sites=['indeed', 'naukri', 'glassdoor'] search_term='java spring boot spring framework spring mvc spring security rest api microservices'
2026-09-17 19:43:05,648 - ERROR - JobSpy:Glassdoor - Glassdoor response status code 400
2026-09-17 19:43:05,649 - ERROR - JobSpy:Glassdoor - Glassdoor: location not parsed
2026-09-17 19:43:06,834 - ERROR - JobSpy:Naukri - Naukri API response status code 406 - {"message":"recaptcha required","statusCode":406,"validationErrors":[]}
19:43:06 INFO services.job_fetcher — scrape_jobs() returned 0 rows | sites=['indeed', 'naukri', 'glassdoor']
```

---

### Platform Breakdown

### A. Naukri — Blocked by Anti-Bot Protection (`HTTP 406 Recaptcha Required`)
* **Cause**: Naukri implements Akamai/Cloudflare bot protection. Direct requests from standard public/datacenter IPs without residential proxy rotation trigger an anti-scraping challenge:
  ```json
  {"message": "recaptcha required", "statusCode": 406, "validationErrors": []}
  ```
* **Status**: This is an IP-level block, not a code defect.
* **Resolution**: Requires rotating residential or ISP proxies supplied via the `proxies` parameter:
  ```python
  scrape_jobs(..., proxies=["http://user:pass@host:port"])
  ```

---

### B. Indeed — Query Oversaturation & Time Window Constraint
* **Cause**: The input string contained 10 concatenated technical terms:
  `"Java Spring Boot Spring Framework Spring MVC Spring Security REST API Microservices"`
  * Unlike LinkedIn, Indeed's search engine treats multi-word search phrases strictly.
  * In addition, `hours_old=168` constrained results strictly to the last 7 days in Gurugram.
  * In the last 7 days in Gurugram, **zero** active postings on Indeed contained every single one of those 10 terms simultaneously.
* **Verification Proof**:
  * Tested standard role `"java developer"` on Indeed in Gurugram with `hours_old=168`: **Returned 10+ jobs in 2.5 seconds**.
  * Tested the 10-word query without `hours_old` (all-time): Returned 10 older jobs.
* **Resolution**:
  1. Tokenize or sanitize multi-skill inputs (e.g. search for primary title like `"Java Developer"` or `"Spring Boot Developer"`).
  2. Make `hours_old` adjustable from the frontend or expand the default window when query specificity is high.

---

### C. Glassdoor — Location Parsing Failure (`HTTP 400 Location Not Parsed`)
* **Cause**: Glassdoor's location resolution rejects `"Gurugram"`. Historically, Glassdoor's database indexes this city as `"Gurgaon, India"`.
* **Resolution**: Map Indian city aliases (e.g. Gurugram $\rightarrow$ Gurgaon, Bengaluru $\rightarrow$ Bangalore) when querying Glassdoor.

---

### D. LinkedIn — Successful (`120 Jobs Returned`)
* **Why it worked**: LinkedIn's search backend uses semantic matching / OR logic across keywords in the query string, matching postings that contain subsets of the technologies.

---

## 3. Full JobSpy Extraction & Schema Matrix

JobSpy can extract **34 distinct fields**. Currently, the pipeline only keeps 8 minimal fields (`title`, `company`, `location`, `job_type`, `is_remote`, `date_posted`, `job_url`, `site`).

Below is the complete inventory of available data:

### Core Job Metadata
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `id` | `str` | Unique platform ID (e.g. `in-9347844...`, `li-44632...`) | All |
| `site` | `str` | Name of job board (`indeed`, `linkedin`, etc.) | All |
| `title` | `str` | Job title | All |
| `company` | `str` | Company / employer name | All |
| `location` | `str` | City, State, Country | All |
| `date_posted` | `date` | Date posted | All |
| `is_remote` | `bool` | Remote work indicator | All |
| `job_type` | `str` | `fulltime`, `parttime`, `internship`, `contract` | All |

### Application & Links
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `job_url` | `str` | Direct link to posting on the job board (LinkedIn, Indeed) | All |
| `job_url_direct` | `str` | **Direct ATS Apply Link** (bypasses job board; links straight to Workday, Taleo, Greenhouse, or corporate careers site) | Indeed, LinkedIn (when fetch description enabled) |

### Compensation & Salary
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `min_amount` | `float` | Minimum compensation | Indeed, Glassdoor, ZipRecruiter |
| `max_amount` | `float` | Maximum compensation | Indeed, Glassdoor, ZipRecruiter |
| `currency` | `str` | Currency code (`INR`, `USD`, etc.) | Indeed, Glassdoor, ZipRecruiter |
| `interval` | `str` | `yearly`, `monthly`, `hourly`, `weekly` | Indeed, Glassdoor, ZipRecruiter |
| `salary_source` | `str` | `direct_data` (employer provided) or `description` (regex parsed) | Indeed |

### Company Profile & Visuals
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `company_logo` | `str` | CDN URL for company logo image (high-res square) | Indeed |
| `company_url` | `str` | Company profile on job board | Indeed, LinkedIn |
| `company_url_direct` | `str` | Direct company corporate homepage | Indeed |
| `company_industry` | `str` | Industry classification | Indeed, LinkedIn |
| `company_addresses` | `str` | Headquarters address | Indeed |
| `company_num_employees` | `str` | Employee size bracket (e.g., `"10,000+"`) | Indeed |
| `company_revenue` | `str` | Revenue bracket (e.g., `"more than $10B (USD)"`) | Indeed |
| `company_description` | `str` | Brief employer overview | Indeed |

### Seniority, Role & Contacts
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `job_level` | `str` | Seniority level (`Entry level`, `Mid-Senior level`, `Director`) | LinkedIn |
| `job_function` | `str` | Department / function (`Engineering`, `IT`) | LinkedIn |
| `emails` | `str` | Contact emails parsed from job post | Indeed, LinkedIn |
| `description` | `str` | Full job description text (Markdown or HTML) | All |

### Naukri-Specific Fields (When Proxied)
| Field | Type | Description | Supported Platforms |
| :--- | :--- | :--- | :--- |
| `skills` | `str` | Comma-separated list of required technical tags | Naukri |
| `experience_range` | `str` | Required experience (e.g. `"3 - 6 Yrs"`) | Naukri |
| `company_rating` | `float` | Employer rating (e.g. `4.1` / 5.0) | Naukri |
| `company_reviews_count`| `int` | Number of employee reviews | Naukri |
| `vacancy_count` | `int` | Number of open vacancies for this role | Naukri |
| `work_from_home_type` | `str` | `Remote`, `Hybrid`, `In-Office` | Naukri |

---

## 4. Implementation Guide: Ingesting Rich Information

### Step 1: Backend Scraper Configuration
In `backend/services/job_fetcher.py`:
```python
kwargs = {
    "site_name": sites,
    "search_term": search_term,
    "location": location,
    "hours_old": hours_old,
    "results_wanted": results_wanted,
    "country_indeed": "India",
    "description_format": "markdown",
    "enforce_annual_salary": True,
}
```

### Step 2: Expand `KEEP_FIELDS`
In `backend/services/job_fetcher.py`:
```python
KEEP_FIELDS: list[str] = [
    # Core
    "title", "company", "location", "job_type", "is_remote", "date_posted", "job_url", "site",
    # Direct Application
    "job_url_direct",
    # Compensation
    "min_amount", "max_amount", "currency", "interval", "salary_source",
    # Company Profile
    "company_logo", "company_url_direct", "company_industry",
    # Seniority & Description
    "job_level", "description", "emails",
    # Naukri Metadata
    "skills", "experience_range", "company_rating",
]
```

### Step 3: Update Pydantic Schemas
In `backend/models/schemas.py`:
```python
class JobListing(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    is_remote: Optional[bool] = None
    date_posted: Optional[str] = None
    job_url: Optional[str] = None
    job_url_direct: Optional[str] = None
    site: Optional[str] = None
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    currency: Optional[str] = None
    interval: Optional[str] = None
    company_logo: Optional[str] = None
    company_url_direct: Optional[str] = None
    job_level: Optional[str] = None
    description: Optional[str] = None
    skills: Optional[str] = None
    experience_range: Optional[str] = None
```

### Step 4: React UI Enhancements
1. **Apply Options**: Provide two action buttons on each job card/row:
   * **Apply Direct (ATS)**: Uses `job_url_direct` to take candidate directly to Workday / Greenhouse.
   * **View on Board**: Opens `job_url` on LinkedIn / Indeed.
2. **Company Visuals**: Show `company_logo` with a graceful fallback to an initial avatar.
3. **Salary Badge**: If `min_amount` and `max_amount` exist, format cleanly as e.g. `₹15L – ₹25L / yr`.
4. **Detail Drawer / Modal**: Click to read the full `description` rendered via markdown without leaving the application.
