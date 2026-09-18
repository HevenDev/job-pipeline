import { useState, useRef, useCallback, type KeyboardEvent, type FormEvent } from 'react'
import type { Job } from '../types'
import JobsTable from '../components/JobsTable'
import {
  Search, MapPin, Briefcase, Laptop, ArrowDown,
  Zap, Filter, ChevronRight, AlertTriangle, ChevronDown,
} from 'lucide-react'

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

const SITE_CONFIG: Record<string, { color: string; dot: string }> = {
  linkedin:     { color: 'text-blue-400 border-blue-500/30 bg-blue-500/10',   dot: 'bg-blue-400' },
  indeed:       { color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', dot: 'bg-emerald-400' },
  naukri:       { color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10', dot: 'bg-yellow-400' },
  glassdoor:    { color: 'text-violet-400 border-violet-500/30 bg-violet-500/10', dot: 'bg-violet-400' },
  zip_recruiter:{ color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',   dot: 'bg-rose-400' },
}

export default function SearchPage() {
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [locationTags, setLocationTags] = useState<string[]>([])
  const [locationInput, setLocationInput] = useState('')
  const [jobType, setJobType] = useState('')
  const [workMode, setWorkMode] = useState('')
  const [jobMap, setJobMap] = useState<Map<string, Job>>(new Map())
  const [streaming, setStreaming] = useState(false)
  const [sourcesChecked, setSourcesChecked] = useState(0)
  const [streamErrors, setStreamErrors] = useState<StreamError[]>([])
  const [streamDone, setStreamDone] = useState(false)
  const [searched, setSearched] = useState(false)

  const offsetRef = useRef(0)
  const esRef = useRef<EventSource | null>(null)
  const seenUrlsRef = useRef<Set<string>>(new Set())
  const counterRef = useRef(0)
  const didFinishRef = useRef(false)

  // Tag handlers
  function commitTag(value: string) {
    const t = value.trim()
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) { setTagInput(''); return }
    setTags(prev => [...prev, t]); setTagInput('')
  }
  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag(tagInput) }
    else if (e.key === 'Backspace' && tagInput === '') setTags(prev => prev.slice(0, -1))
  }
  function removeTag(tag: string) { setTags(prev => prev.filter(t => t !== tag)) }

  // Location handlers
  function commitLocationTag(value: string) {
    const t = value.trim()
    if (!t || locationTags.includes(t) || locationTags.length >= MAX_LOCATIONS) { setLocationInput(''); return }
    setLocationTags(prev => [...prev, t]); setLocationInput('')
  }
  function handleLocationKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitLocationTag(locationInput) }
    else if (e.key === 'Backspace' && locationInput === '') setLocationTags(prev => prev.slice(0, -1))
  }
  function removeLocationTag(tag: string) { setLocationTags(prev => prev.filter(t => t !== tag)) }

  const openStream = useCallback(
    (currentTags: string[], currentLocations: string[], currentOffset: number, isLoadMore: boolean) => {
      if (esRef.current) { esRef.current.close(); esRef.current = null }
      if (!isLoadMore) {
        setJobMap(new Map()); seenUrlsRef.current = new Set()
        setStreamErrors([]); setStreamDone(false); setSourcesChecked(0); setSearched(true)
      }
      setStreaming(true); didFinishRef.current = false

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
        setSourcesChecked(prev => prev + 1)
        const newEntries: [string, Job][] = []
        for (const job of data.jobs) {
          const key = job.job_url?.trim().toLowerCase() || ''
          if (!key) newEntries.push([`__no_url_${counterRef.current++}`, job])
          else if (!seenUrlsRef.current.has(key)) { seenUrlsRef.current.add(key); newEntries.push([key, job]) }
        }
        if (newEntries.length > 0) {
          setJobMap(prev => { const next = new Map(prev); for (const [k, v] of newEntries) next.set(k, v); return next })
        }
      })

      es.addEventListener('job_error', (e: MessageEvent) => {
        const data: ErrorData = JSON.parse(e.data)
        setStreamErrors(prev => [...prev, { id: `err-${Date.now()}-${Math.random()}`, source: data.source, message: data.message }])
      })

      es.addEventListener('done', () => {
        didFinishRef.current = true; setStreaming(false); setStreamDone(true); es.close(); esRef.current = null
      })

      es.onerror = () => {
        if (didFinishRef.current) return
        setStreamErrors(prev => [...prev, { id: `err-conn-${Date.now()}`, source: 'connection', message: 'Connection to server lost.' }])
        setStreaming(false); setStreamDone(true); es.close(); esRef.current = null
      }
    },
    [jobType, workMode]
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const finalTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags
    if (tagInput.trim()) { setTags(finalTags); setTagInput('') }
    const finalLocations = locationInput.trim() ? [...locationTags, locationInput.trim()] : locationTags
    if (locationInput.trim()) { setLocationTags(finalLocations); setLocationInput('') }
    if (finalTags.length === 0 || finalLocations.length === 0) return
    offsetRef.current = 0; openStream(finalTags, finalLocations, 0, false)
  }

  function handleLoadMore() {
    const newOffset = jobMap.size; offsetRef.current = newOffset
    openStream(tags, locationTags, newOffset, true)
  }

  const jobs = [...jobMap.values()]
  const sites = [...new Set(jobs.map(j => j.site).filter(Boolean))] as string[]
  const canSearch = tags.length > 0 && locationTags.length > 0 && !streaming
  const showLoadMore = streamDone && jobs.length > 0 && !streaming

  return (
    <>
      {/* ── Hero (shown before first search) ── */}
      {!searched && (
        <section className="mb-10 pt-4 text-center">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-violet-300 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            Live · Aggregating now
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight mb-3 bg-gradient-to-br from-white via-violet-200 to-violet-400 bg-clip-text text-transparent">
            Job Pipeline
          </h1>
          <p className="text-slate-400 text-base max-w-md mx-auto mb-8">
            Real-time job aggregation from LinkedIn, Indeed, Naukri &amp; Glassdoor — deduplicated and ranked.
          </p>

          {/* Source pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {Object.entries(SITE_CONFIG).slice(0, 4).map(([site, cfg]) => (
              <span key={site} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {site}
              </span>
            ))}
          </div>

          {/* Pipeline flow visualisation */}
          <div className="mx-auto flex max-w-lg items-center justify-center gap-0 mb-2">
            {[
              { icon: Search, label: 'Search' },
              { icon: Filter, label: 'Filter' },
              { icon: Zap, label: 'Match' },
              { icon: Briefcase, label: 'Results' },
            ].map(({ icon: Icon, label }, i) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10 shadow-[0_0_12px_rgba(139,92,246,0.2)]">
                    <Icon className="h-4 w-4 text-violet-400" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">{label}</span>
                </div>
                {i < 3 && (
                  <div className="w-10 flex items-center justify-center -mt-4 shrink-0">
                    <ChevronRight className="h-4 w-4 text-violet-500/40" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Search Form ── */}
      <section aria-label="Job search filters" className="mb-8">
        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-violet-500/10 bg-white/[0.03] p-6 shadow-[0_4px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            <div className="mb-1 pb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Configure Your Search</h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {/* Role / Keywords */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <Search className="h-3 w-3" />
                  Role / Keywords
                  <span className="ml-auto text-[10px] text-slate-600 font-normal normal-case tracking-normal">
                    {tags.length}/{MAX_TAGS} · Enter or comma to add
                  </span>
                </label>
                <div
                  className={`flex flex-wrap items-center gap-1.5 min-h-[44px] rounded-xl border px-3 py-2 transition-all cursor-text ${
                    tags.length >= MAX_TAGS
                      ? 'border-slate-700/50 bg-white/[0.02] opacity-70'
                      : 'border-violet-500/20 bg-white/[0.04] focus-within:border-violet-500/50 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.1)]'
                  }`}
                  onClick={() => document.getElementById('tag-input-field')?.focus()}
                  role="group"
                  aria-label="Keyword tags"
                >
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[12px] font-medium text-violet-300">
                      {tag}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeTag(tag) }}
                        className="ml-0.5 rounded text-violet-400/60 hover:text-violet-300 transition-colors"
                      >×</button>
                    </span>
                  ))}
                  {tags.length < MAX_TAGS && (
                    <input
                      id="tag-input-field"
                      type="text"
                      className="flex-1 min-w-[140px] bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
                      placeholder={tags.length === 0 ? 'e.g. React Developer, SDE, Java…' : 'Add another role…'}
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

              {/* Location */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  <MapPin className="h-3 w-3" />
                  Location
                  <span className="ml-auto text-[10px] text-slate-600 font-normal normal-case tracking-normal">
                    {locationTags.length}/{MAX_LOCATIONS} · Enter or comma to add
                  </span>
                </label>
                <div
                  className={`flex flex-wrap items-center gap-1.5 min-h-[44px] rounded-xl border px-3 py-2 transition-all cursor-text ${
                    locationTags.length >= MAX_LOCATIONS
                      ? 'border-slate-700/50 bg-white/[0.02] opacity-70'
                      : 'border-violet-500/20 bg-white/[0.04] focus-within:border-violet-500/50 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,0.1)]'
                  }`}
                  onClick={() => document.getElementById('location-input-field')?.focus()}
                  role="group"
                  aria-label="Location tags"
                >
                  {locationTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[12px] font-medium text-emerald-300">
                      <MapPin className="h-2.5 w-2.5" />
                      {tag}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeLocationTag(tag) }}
                        className="ml-0.5 rounded text-emerald-400/60 hover:text-emerald-300 transition-colors"
                      >×</button>
                    </span>
                  ))}
                  {locationTags.length < MAX_LOCATIONS && (
                    <input
                      id="location-input-field"
                      type="text"
                      className="flex-1 min-w-[140px] bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
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

              {/* Job Type + Work Mode row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    <Briefcase className="h-3 w-3" /> Job Type
                  </label>
                  <div className="relative">
                    <select
                      id="field-job-type"
                      value={jobType}
                      onChange={e => setJobType(e.target.value)}
                      disabled={streaming}
                      className="w-full h-[44px] appearance-none rounded-xl border border-violet-500/20 bg-white/[0.04] px-3 pr-8 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <option value="" className="bg-[#111827]">Any Type</option>
                      <option value="fulltime" className="bg-[#111827]">Full-time</option>
                      <option value="parttime" className="bg-[#111827]">Part-time</option>
                      <option value="internship" className="bg-[#111827]">Internship</option>
                      <option value="contract" className="bg-[#111827]">Contract</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    <Laptop className="h-3 w-3" /> Work Mode
                  </label>
                  <div className="relative">
                    <select
                      id="field-work-mode"
                      value={workMode}
                      onChange={e => setWorkMode(e.target.value)}
                      disabled={streaming}
                      className="w-full h-[44px] appearance-none rounded-xl border border-violet-500/20 bg-white/[0.04] px-3 pr-8 text-sm text-slate-100 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <option value="" className="bg-[#111827]">Any Mode</option>
                      <option value="remote" className="bg-[#111827]">Remote</option>
                      <option value="onsite" className="bg-[#111827]">Onsite / Hybrid</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 flex items-center justify-between border-t border-violet-500/10 pt-5">
              <p className="text-xs text-slate-600">
                {canSearch ? `Ready · ${tags.length} role${tags.length !== 1 ? 's' : ''}, ${locationTags.length} location${locationTags.length !== 1 ? 's' : ''}` : 'Add at least one role and one location to search'}
              </p>
              <button
                id="btn-search-jobs"
                type="submit"
                disabled={!canSearch}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500 hover:shadow-[0_0_28px_rgba(139,92,246,0.5)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {streaming ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Searching…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
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
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-slate-300" role="status" aria-live="polite">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            Scanning sources… <strong className="text-violet-300">{sourcesChecked}</strong> checked
            {jobs.length > 0 && <span className="ml-auto text-slate-500">{jobs.length} jobs so far</span>}
          </div>
        )}

        {/* Stream errors */}
        {streamErrors.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2" role="log">
            {streamErrors.map(err => (
              <span key={err.id} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300" title={err.message}>
                <AlertTriangle className="h-3 w-3" />
                {err.source}: {err.message.length > 60 ? err.message.slice(0, 57) + '…' : err.message}
              </span>
            ))}
          </div>
        )}

        {/* Results */}
        {searched && (
          <>
            {jobs.length === 0 && streamDone ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-white/[0.03]">
                  <Search className="h-6 w-6 text-slate-600" />
                </div>
                <h3 className="font-semibold text-slate-300">No jobs found</h3>
                <p className="max-w-sm text-sm text-slate-500">Try different keywords, a broader location, or remove the job type filter.</p>
              </div>
            ) : jobs.length > 0 ? (
              <>
                {/* Stats bar */}
                <div className="mb-4 flex flex-wrap items-center gap-2" aria-live="polite">
                  <p className="text-sm text-slate-400">
                    Found <strong className="text-violet-300 font-semibold">{jobs.length}</strong> listing{jobs.length !== 1 ? 's' : ''}
                    {streaming && <span className="ml-2 text-xs text-violet-400 animate-pulse">· streaming</span>}
                  </p>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {sites.map(s => {
                      const cfg = SITE_CONFIG[s.toLowerCase()] ?? { color: 'text-slate-400 border-slate-700 bg-white/5', dot: 'bg-slate-400' }
                      return (
                        <span key={s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cfg.color}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {s}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <JobsTable jobs={jobs} />

                {showLoadMore && (
                  <div className="mt-6 flex justify-center">
                    <button
                      id="btn-load-more"
                      type="button"
                      onClick={handleLoadMore}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 px-6 py-2.5 text-sm font-semibold text-violet-300 transition-all hover:bg-violet-500/10 hover:border-violet-500/50 hover:-translate-y-0.5"
                    >
                      <ArrowDown className="h-4 w-4" />
                      Load more results
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}

        {/* Pre-search state */}
        {!searched && !streaming && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 shadow-[0_0_24px_rgba(139,92,246,0.15)]">
              <Briefcase className="h-6 w-6 text-violet-400" />
            </div>
            <h3 className="font-semibold text-slate-300">Ready to search</h3>
            <p className="max-w-sm text-sm text-slate-500">Add role keywords and a location above, then click Search Jobs to fetch live postings.</p>
          </div>
        )}
      </main>
    </>
  )
}
