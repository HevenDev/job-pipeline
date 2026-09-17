import { useState, type FormEvent } from 'react'
import './App.css'

// ── Types ──────────────────────────────────────────────────────
interface Job {
  title?: string
  company?: string
  location?: string
  job_type?: string
  is_remote?: boolean | null
  date_posted?: string | null
  job_url?: string | null
  site?: string
}

interface ApiResponse {
  jobs: Job[]
  total: number
}

// ── Helpers ────────────────────────────────────────────────────
function formatDate(raw?: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function normaliseSite(site?: string): string {
  if (!site) return ''
  return site.toLowerCase().replace(/\s+/g, '_')
}

function formatJobType(type?: string | null, isRemote?: boolean | null): string {
  if (!type && isRemote == null) return '—'
  const parts: string[] = []
  if (type) parts.push(type.charAt(0).toUpperCase() + type.slice(1))
  if (isRemote === true) parts.push('Remote')
  return parts.join(' · ') || '—'
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

// ── Component ──────────────────────────────────────────────────
export default function App() {
  // Form state
  const [role, setRole] = useState('')
  const [location, setLocation] = useState('')
  const [jobType, setJobType] = useState('')
  const [workMode, setWorkMode] = useState('')

  // Request state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [searched, setSearched] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!role.trim() || !location.trim()) return

    setLoading(true)
    setError(null)
    setJobs(null)
    setSearched(true)

    const params = new URLSearchParams()
    params.set('role', role.trim())
    params.set('location', location.trim())
    if (jobType) params.set('job_type', jobType)
    if (workMode === 'remote') params.set('is_remote', 'true')
    if (workMode === 'onsite') params.set('is_remote', 'false')

    try {
      const res = await fetch(`${API_BASE_URL}/api/jobs?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.detail ?? `Server error ${res.status}`)
      }
      const data: ApiResponse = await res.json()
      setJobs(data.jobs)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Unique site names for the stats bar
  const sites = jobs
    ? [...new Set(jobs.map(j => j.site).filter(Boolean))]
    : []

  return (
    <div className="app-wrapper">
      <div className="container">
        {/* ── Header ── */}
        <header className="app-header">
          <div className="badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="5" />
            </svg>
            Live · Phase 1.5
          </div>
          <h1>Pipeline</h1>
          <p>Search real-time job postings from LinkedIn, Indeed, Naukri &amp; Glassdoor</p>
        </header>

        {/* ── Search Form ── */}
        <section aria-label="Job search filters">
          <form onSubmit={handleSubmit}>
            <div className="search-card">
              <div className="search-grid">
                {/* Role */}
                <div className="field-group">
                  <label htmlFor="field-role">Role / Keyword</label>
                  <input
                    id="field-role"
                    type="text"
                    placeholder="e.g. Software Engineer"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* Location */}
                <div className="field-group">
                  <label htmlFor="field-location">Location</label>
                  <input
                    id="field-location"
                    type="text"
                    placeholder="e.g. Delhi, India"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                {/* Job Type */}
                <div className="field-group">
                  <label htmlFor="field-job-type">Job Type</label>
                  <select
                    id="field-job-type"
                    value={jobType}
                    onChange={e => setJobType(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="fulltime">Full-time</option>
                    <option value="parttime">Part-time</option>
                    <option value="internship">Internship</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>

                {/* Work Mode */}
                <div className="field-group">
                  <label htmlFor="field-work-mode">Work Mode</label>
                  <select
                    id="field-work-mode"
                    value={workMode}
                    onChange={e => setWorkMode(e.target.value)}
                  >
                    <option value="">Any</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">Onsite / Hybrid</option>
                  </select>
                </div>
              </div>

              <div className="search-footer">
                <button
                  id="btn-search-jobs"
                  type="submit"
                  className="btn-search"
                  disabled={loading || !role.trim() || !location.trim()}
                >
                  {loading ? (
                    <>
                      <span
                        className="spinner"
                        style={{ width: 16, height: 16, borderWidth: 2 }}
                      />
                      Searching…
                    </>
                  ) : (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                      Search Jobs
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* ── Results Area ── */}
        <main>
          {/* Full-page loading */}
          {loading && (
            <div className="loading-wrap" role="status" aria-live="polite">
              <div className="spinner" />
              <p>Fetching live listings from 4 job boards…<br />Broad searches may take 1–3 minutes.</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="state-box is-error" role="alert">
              <span className="state-icon">⚠️</span>
              <h3>Something went wrong</h3>
              <p>{error}</p>
            </div>
          )}

          {/* Results */}
          {!loading && !error && jobs !== null && (
            <>
              {jobs.length === 0 ? (
                <div className="state-box">
                  <span className="state-icon">🔍</span>
                  <h3>No jobs found</h3>
                  <p>
                    Try different filters — a broader keyword, different location, or remove the
                    job type / work mode filter.
                  </p>
                </div>
              ) : (
                <>
                  {/* Stats bar */}
                  <div className="results-meta" aria-live="polite">
                    <p className="results-count">
                      Found <strong>{jobs.length}</strong> listing{jobs.length !== 1 ? 's' : ''}
                    </p>
                    {sites.map(s => (
                      <span key={s} className="site-pill">
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Table */}
                  <div className="jobs-table-wrap">
                    <table className="jobs-table" aria-label="Job listings">
                      <thead>
                        <tr>
                          <th scope="col">Title</th>
                          <th scope="col">Company</th>
                          <th scope="col">Location</th>
                          <th scope="col">Type</th>
                          <th scope="col">Posted</th>
                          <th scope="col">Source</th>
                          <th scope="col">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className="job-title">{job.title ?? '—'}</span>
                            </td>
                            <td>
                              <span className="job-company">{job.company ?? '—'}</span>
                            </td>
                            <td>
                              <span className="job-location">{job.location ?? '—'}</span>
                            </td>
                            <td>
                              <span
                                className={`type-badge${job.is_remote ? ' remote' : ''}`}
                              >
                                {formatJobType(job.job_type, job.is_remote)}
                              </span>
                            </td>
                            <td>{formatDate(job.date_posted)}</td>
                            <td>
                              {job.site ? (
                                <span className={`site-badge ${normaliseSite(job.site)}`}>
                                  {job.site}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              {job.job_url ? (
                                <a
                                  href={job.job_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-view"
                                  aria-label={`View ${job.title ?? 'job'} posting`}
                                >
                                  View
                                  <svg
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Initial prompt — before first search */}
          {!loading && !error && jobs === null && !searched && (
            <div className="state-box">
              <span className="state-icon">💼</span>
              <h3>Ready to search</h3>
              <p>Enter a role and location above, then click Search Jobs to fetch live postings.</p>
            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="app-footer">
          <p>Pipeline · Phase 1.5 · Powered by python-jobspy</p>
        </footer>
      </div>
    </div>
  )
}
