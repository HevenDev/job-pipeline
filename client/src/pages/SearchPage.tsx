import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import '../App.css'
import type { Job, SearchHistory } from '../types'
import { formatDate } from '../utils'
import JobsTable from '../components/JobsTable'

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

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const MAX_TAGS = 6
const MAX_LOCATIONS = 5

export default function SearchPage() {
  // Recent searches state
  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/history?limit=3`)
      .then(res => res.json())
      .then(data => {
        if (data && data.history) {
          setRecentSearches(data.history)
        }
      })
      .catch(() => {})
  }, [])

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
    <>
        {/* ── Header is now in Layout App.tsx ── */}

        {/* ── Search Form ── */}
        <section aria-label="Job search filters">
          <form onSubmit={handleSubmit}>
            <div className="search-card">
              <div className="search-grid">
                {/* Tag / Keyword Input */}
                <div className="field-group col-span-full">
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
                <div className="field-group col-span-full">
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
                        className="spinner w-4 h-4 border-2"
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
                  <JobsTable jobs={jobs} />

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
            <>
              <header className="app-header mb-8 text-center">
                <div className="badge mx-auto mb-4">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <circle cx="5" cy="5" r="5" />
                  </svg>
                  Live · Phase 2
                </div>
                <h1 className="text-4xl font-extrabold mb-2 tracking-tight">Pipeline</h1>
                <p className="text-[#888]">Search real-time job postings from LinkedIn, Indeed, Naukri &amp; Glassdoor</p>
              </header>

              <div className="state-box">
                <span className="state-icon">💼</span>
                <h3>Ready to search</h3>
                <p>Add one or more keyword tags and a location above, then click Search Jobs to fetch live postings.</p>
              </div>
              
              {recentSearches.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-4 text-[var(--fg)] text-lg font-semibold">Recent Searches</h3>
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                    {recentSearches.map(h => (
                      <Link 
                        to={`/history?role=${h.roles.join(',')}&location=${h.locations.join(',')}`} 
                        key={h.search_id} 
                        className="search-card hover-lift no-underline text-inherit p-5 block border border-[#333] rounded-lg"
                      >
                        <div className="flex justify-between mb-3 items-start">
                          <strong className="text-[1.05rem] leading-snug">{h.roles.join(', ') || 'Any Role'}</strong>
                        </div>
                        <div className="text-sm text-[#aaa] mb-5 flex items-center gap-1.5">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                          {h.locations.join(', ') || 'Any Location'}
                        </div>
                        <div className="flex justify-between text-[0.85rem] border-t border-[#222] pt-3">
                          <span className="text-[#888]">{formatDate(h.started_at)}</span>
                          <span className="text-[var(--success)] font-medium">{h.total_matched} matches</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {/* ── Footer is now in Layout App.tsx ── */}
    </>
  )
}
