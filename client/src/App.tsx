import { useState, useRef, useCallback, type KeyboardEvent, type FormEvent } from 'react'
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
  matched_location?: string | null
}

interface BatchData {
  jobs: Job[]
  tag: string
  city: string
  sites: string[]
  count: number
}

interface ErrorData {
  source: string
  message: string
}


interface StreamError {
  id: string
  source: string
  message: string
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
const MAX_TAGS = 6
const MAX_LOCATIONS = 5

// ── Component ──────────────────────────────────────────────────
export default function App() {
  // Tag input state
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // Location tag state
  const [locationTags, setLocationTags] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState('')

  // Other form fields
  const [jobType, setJobType] = useState('')
  const [workMode, setWorkMode] = useState('')

  // Results state — Map keyed by job_url for O(1) dedup
  const [jobMap, setJobMap] = useState<Map<string, Job>>(new Map())

  // Stream state
  const [streaming, setStreaming] = useState(false)
  const [sourcesChecked, setSourcesChecked] = useState(0)
  const [streamErrors, setStreamErrors] = useState<StreamError[]>([])
  const [streamDone, setStreamDone] = useState(false)
  const [searched, setSearched] = useState(false)

  // Pagination
  const offsetRef = useRef(0)

  // Refs — persistent across renders, not triggering re-render
  const esRef = useRef<EventSource | null>(null)
  const seenUrlsRef = useRef<Set<string>>(new Set())
  const counterRef = useRef(0)
  // didFinish: set to true inside the 'done' handler before es.close() so that
  // onerror (which fires on ANY close, including clean ones) can no-op safely.
  const didFinishRef = useRef(false)

  // ── Role tag handlers ────────────────────────────────────────
  function commitTag(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    if (tags.includes(trimmed)) { setTagInput(''); return }
    if (tags.length >= MAX_TAGS) return
    setTags(prev => [...prev, trimmed])
    setTagInput('')
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitTag(tagInput)
    } else if (e.key === 'Backspace' && tagInput === '') {
      setTags(prev => prev.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag))
  }

  // ── Location tag handlers ────────────────────────────────────
  function commitLocationTag(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    if (locationTags.includes(trimmed)) { setLocationInput(''); return }
    if (locationTags.length >= MAX_LOCATIONS) return
    setLocationTags(prev => [...prev, trimmed])
    setLocationInput('')
  }

  function handleLocationKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitLocationTag(locationInput)
    } else if (e.key === 'Backspace' && locationInput === '') {
      setLocationTags(prev => prev.slice(0, -1))
    }
  }

  function removeLocationTag(tag: string) {
    setLocationTags(prev => prev.filter(t => t !== tag))
  }

  // ── SSE stream helper ───────────────────────────────────────
  const openStream = useCallback(
    (currentTags: string[], currentLocations: string[], currentOffset: number, isLoadMore: boolean) => {
      // Close any existing connection
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }

      if (!isLoadMore) {
        // Full reset for new searches
        setJobMap(new Map())
        seenUrlsRef.current = new Set()
        setStreamErrors([])
        setStreamDone(false)
        setSourcesChecked(0)
        setSearched(true)
      }

      setStreaming(true)
      didFinishRef.current = false

      // Build query string — repeated role= and location= params
      const params = new URLSearchParams()
      currentTags.forEach(t => params.append('role', t))
      currentLocations.forEach(l => params.append('location', l))
      if (jobType) params.set('job_type', jobType)
      if (workMode === 'remote') params.set('is_remote', 'true')
      if (workMode === 'onsite') params.set('is_remote', 'false')
      if (currentOffset > 0) params.set('offset', String(currentOffset))

      const es = new EventSource(`${API_BASE_URL}/api/jobs?${params.toString()}`)
      esRef.current = es

      es.addEventListener('batch', (e: MessageEvent) => {
        const data: BatchData = JSON.parse(e.data)
        // Debug: confirm batches are arriving with named listener
        console.log('[SSE batch]', data.tag, data.city, 'jobs:', data.jobs.length)
        setSourcesChecked(prev => prev + 1)

        // ── Dedup OUTSIDE the state updater ────────────────────────────────
        // React Strict Mode double-invokes functional state updaters to detect
        // side effects. Mutating seenUrlsRef inside the updater would mean the
        // second invocation finds all URLs already "seen" and returns an empty
        // Map — causing jobs to silently disappear. Filter here (once, with a
        // real side effect) then pass the clean list into a pure updater.
        const newEntries: [string, Job][] = []
        for (const job of data.jobs) {
          const key = job.job_url?.trim().toLowerCase() || ''
          if (!key) {
            // No URL — generate a stable-enough key from counter
            newEntries.push([`__no_url_${counterRef.current++}`, job])
          } else if (!seenUrlsRef.current.has(key)) {
            seenUrlsRef.current.add(key)
            newEntries.push([key, job])
          }
        }

        if (newEntries.length > 0) {
          // Pure updater: no side effects, safe to double-invoke
          setJobMap(prev => {
            const next = new Map(prev)
            for (const [k, v] of newEntries) next.set(k, v)
            return next
          })
        }
      })

      es.addEventListener('job_error', (e: MessageEvent) => {
        const data: ErrorData = JSON.parse(e.data)
        setStreamErrors(prev => [
          ...prev,
          { id: `err-${Date.now()}-${Math.random()}`, source: data.source, message: data.message },
        ])
      })

      es.addEventListener('done', (_e: MessageEvent) => {
        // Mark finished BEFORE close() so onerror can detect a clean shutdown
        didFinishRef.current = true
        setStreaming(false)
        setStreamDone(true)
        es.close()
        esRef.current = null
      })

      es.onerror = () => {
        // onerror fires on ANY EventSource close, including after a clean done+close().
        // Guard with didFinish so we don't show a spurious error on normal completion.
        if (didFinishRef.current) return
        setStreamErrors(prev => [
          ...prev,
          { id: `err-conn-${Date.now()}`, source: 'connection', message: 'Connection to server lost.' },
        ])
        setStreaming(false)
        setStreamDone(true)
        es.close()
        esRef.current = null
      }
    },
    [jobType, workMode]
  )

  // ── Form submit ─────────────────────────────────────────────
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Commit any partially-typed role tag
    const finalTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags
    if (tagInput.trim()) { setTags(finalTags); setTagInput('') }
    // Commit any partially-typed location tag
    const finalLocations = locationInput.trim()
      ? [...locationTags, locationInput.trim()]
      : locationTags
    if (locationInput.trim()) { setLocationTags(finalLocations); setLocationInput('') }

    if (finalTags.length === 0 || finalLocations.length === 0) return
    offsetRef.current = 0
    openStream(finalTags, finalLocations, 0, false)
  }

  // ── Load More ───────────────────────────────────────────────
  function handleLoadMore() {
    const newOffset = jobMap.size
    offsetRef.current = newOffset
    openStream(tags, locationTags, newOffset, true)
  }

  // ── Derived values ──────────────────────────────────────────
  const jobs = [...jobMap.values()]
  const sites = [...new Set(jobs.map(j => j.site).filter(Boolean))]
  const canSearch = tags.length > 0 && locationTags.length > 0 && !streaming
  const showLoadMore = streamDone && jobs.length > 0 && !streaming

  return (
    <div className="app-wrapper">
      <div className="container">
        {/* ── Header ── */}
        <header className="app-header">
          <div className="badge">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <circle cx="5" cy="5" r="5" />
            </svg>
            Live · Phase 2
          </div>
          <h1>Pipeline</h1>
          <p>Search real-time job postings from LinkedIn, Indeed, Naukri &amp; Glassdoor</p>
        </header>

        {/* ── Search Form ── */}
        <section aria-label="Job search filters">
          <form onSubmit={handleSubmit}>
            <div className="search-card">
              <div className="search-grid">
                {/* Tag / Keyword Input */}
                <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="tag-input-field">
                    Role / Keywords
                    <span className="tag-count-hint">
                      {tags.length}/{MAX_TAGS} — Press Enter or comma to add
                    </span>
                  </label>
                  <div
                    className={`tag-input-wrap${tags.length >= MAX_TAGS ? ' is-maxed' : ''}`}
                    onClick={() => document.getElementById('tag-input-field')?.focus()}
                    role="group"
                    aria-label="Keyword tags"
                  >
                    {tags.map(tag => (
                      <span key={tag} className="tag-chip">
                        {tag}
                        <button
                          type="button"
                          className="tag-chip-remove"
                          onClick={e => { e.stopPropagation(); removeTag(tag) }}
                          aria-label={`Remove tag ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {tags.length < MAX_TAGS && (
                      <input
                        id="tag-input-field"
                        type="text"
                        className="tag-inner-input"
                        placeholder={tags.length === 0 ? 'e.g. Java Developer, SDE, Spring Boot…' : 'Add another…'}
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        onBlur={() => commitTag(tagInput)}
                        autoComplete="off"
                        disabled={streaming}
                      />
                    )}
                  </div>
                </div>

                {/* Location Tag Input */}
                <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="location-input-field">
                    Location
                    <span className="tag-count-hint">
                      {locationTags.length}/{MAX_LOCATIONS} — Press Enter or comma to add
                    </span>
                  </label>
                  <div
                    className={`tag-input-wrap${locationTags.length >= MAX_LOCATIONS ? ' is-maxed' : ''}`}
                    onClick={() => document.getElementById('location-input-field')?.focus()}
                    role="group"
                    aria-label="Location tags"
                  >
                    {locationTags.map(tag => (
                      <span key={tag} className="tag-chip tag-chip--location">
                        {tag}
                        <button
                          type="button"
                          className="tag-chip-remove"
                          onClick={e => { e.stopPropagation(); removeLocationTag(tag) }}
                          aria-label={`Remove location ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {locationTags.length < MAX_LOCATIONS && (
                      <input
                        id="location-input-field"
                        type="text"
                        className="tag-inner-input"
                        placeholder={locationTags.length === 0 ? 'e.g. Gurugram, Noida, Mumbai…' : 'Add city…'}
                        value={locationInput}
                        onChange={e => setLocationInput(e.target.value)}
                        onKeyDown={handleLocationKeyDown}
                        onBlur={() => commitLocationTag(locationInput)}
                        autoComplete="off"
                        disabled={streaming}
                      />
                    )}
                  </div>
                </div>

                {/* Job Type */}
                <div className="field-group">
                  <label htmlFor="field-job-type">Job Type</label>
                  <select
                    id="field-job-type"
                    value={jobType}
                    onChange={e => setJobType(e.target.value)}
                    disabled={streaming}
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
                    disabled={streaming}
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
                  disabled={!canSearch}
                >
                  {streaming ? (
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
          {/* Live stream status */}
          {streaming && (
            <div className="stream-status" role="status" aria-live="polite">
              <span className="stream-status-dot" />
              Searching… <strong>{sourcesChecked}</strong> source{sourcesChecked !== 1 ? 's' : ''} checked
              {jobs.length > 0 && (
                <span className="stream-status-count"> · {jobs.length} jobs so far</span>
              )}
            </div>
          )}

          {/* Stream error notes (non-blocking) */}
          {streamErrors.length > 0 && (
            <div className="source-errors-wrap" role="log" aria-label="Source errors">
              {streamErrors.map(err => (
                <span key={err.id} className="source-error-pill" title={err.message}>
                  ⚠ {err.source}: {err.message.length > 60 ? err.message.slice(0, 57) + '…' : err.message}
                </span>
              ))}
            </div>
          )}

          {/* Results */}
          {searched && (
            <>
              {jobs.length === 0 && streamDone ? (
                <div className="state-box">
                  <span className="state-icon">🔍</span>
                  <h3>No jobs found</h3>
                  <p>
                    Try different tags — a broader keyword, different location, or remove the
                    job type / work mode filter.
                  </p>
                </div>
              ) : jobs.length > 0 ? (
                <>
                  {/* Stats bar */}
                  <div className="results-meta" aria-live="polite">
                    <p className="results-count">
                      {streaming ? 'Found' : 'Found'} <strong>{jobs.length}</strong> listing{jobs.length !== 1 ? 's' : ''}
                      {streaming && <span className="results-streaming-indicator"> · streaming</span>}
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
                          <tr key={job.job_url || `no-url-${idx}`}>
                            <td>
                              <span className="job-title">{job.title ?? '—'}</span>
                            </td>
                            <td>
                              <span className="job-company">{job.company ?? '—'}</span>
                            </td>
                            <td>
                              <span className="job-location">
                                {job.location ?? '—'}
                                {job.matched_location && (
                                  <span className="matched-location-badge">
                                    {job.matched_location}
                                  </span>
                                )}
                              </span>
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

                  {/* Load More */}
                  {showLoadMore && (
                    <div className="load-more-wrap">
                      <button
                        id="btn-load-more"
                        type="button"
                        className="btn-load-more"
                        onClick={handleLoadMore}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12l7 7 7-7" />
                        </svg>
                        Load more results
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}

          {/* Initial prompt — before first search */}
          {!searched && (
            <div className="state-box">
              <span className="state-icon">💼</span>
              <h3>Ready to search</h3>
              <p>Add one or more keyword tags and a location above, then click Search Jobs to fetch live postings.</p>
            </div>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="app-footer">
          <p>Pipeline · Phase 2 · Powered by python-jobspy</p>
        </footer>
      </div>
    </div>
  )
}
