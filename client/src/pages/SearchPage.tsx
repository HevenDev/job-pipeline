import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type FormEvent } from 'react'
import type { Job } from '../types'
import JobsTable from '../components/JobsTable'
import {
  Search, MapPin, Briefcase, Laptop, ArrowDown,
  Zap, Filter, ChevronRight, AlertTriangle, ChevronDown,
  Sparkles, Bot, Radio, CheckCircle2, RefreshCw
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

const API_BASE_URL = (
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : import.meta.env.DEV ? 'http://localhost:8000' : ''
).replace(/\/$/, '')

const MAX_TAGS = 6
const MAX_LOCATIONS = 5

const SITE_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  linkedin:      { color: 'text-blue-300 border-blue-400/40 bg-blue-500/15',          dot: 'bg-blue-400', label: 'LinkedIn' },
  indeed:        { color: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15', dot: 'bg-emerald-400', label: 'Indeed' },
  naukri:        { color: 'text-amber-300 border-amber-400/40 bg-amber-500/15',       dot: 'bg-amber-400', label: 'Naukri' },
  glassdoor:     { color: 'text-violet-300 border-violet-400/40 bg-violet-500/15',    dot: 'bg-violet-400', label: 'Glassdoor' },
  zip_recruiter: { color: 'text-rose-300 border-rose-400/40 bg-rose-500/15',          dot: 'bg-rose-400', label: 'ZipRecruiter' },
}

const SUGGESTED_ROLES = [
  'React Developer',
  'Frontend Engineer',
  'Full Stack',
  'Python Developer',
  'Backend Engineer',
  'DevOps',
]

const SUGGESTED_LOCATIONS = [
  'Remote',
  'Bengaluru',
  'Gurugram',
  'Hyderabad',
  'Mumbai',
  'Noida',
]

const AI_PHASES = [
  'Initializing intelligent multi-source crawlers across job platforms...',
  'Scanning LinkedIn, Indeed, Naukri & Glassdoor in parallel...',
  'Parsing job descriptions, tech stacks & normalization schemas...',
  'Cross-source deduplication & relevance verification in progress...',
  'Synthesizing real-time verified job opportunities...',
]
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
  const [aiPhaseIdx, setAiPhaseIdx] = useState(0)

  const offsetRef = useRef(0)
  const esRef = useRef<EventSource | null>(null)
  const seenUrlsRef = useRef<Set<string>>(new Set())
  const counterRef = useRef(0)
  const didFinishRef = useRef(false)

  // Cycle AI messages during streaming
  useEffect(() => {
    if (!streaming) return
    const timer = setInterval(() => {
      setAiPhaseIdx(prev => (prev + 1) % AI_PHASES.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [streaming])

  // Tag handlers
  function commitTag(value: string) {
    const t = value.trim()
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) {
      setTagInput('')
      return
    }
    setTags(prev => [...prev, t])
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

  // Location handlers
  function commitLocationTag(value: string) {
    const t = value.trim()
    if (!t || locationTags.includes(t) || locationTags.length >= MAX_LOCATIONS) {
      setLocationInput('')
      return
    }
    setLocationTags(prev => [...prev, t])
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

  const openStream = useCallback(
    (currentTags: string[], currentLocations: string[], currentOffset: number, isLoadMore: boolean) => {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      if (!isLoadMore) {
        setJobMap(new Map())
        seenUrlsRef.current = new Set()
        setStreamErrors([])
        setStreamDone(false)
        setSourcesChecked(0)
        setSearched(true)
      }
      setStreaming(true)
      didFinishRef.current = false

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
          if (!key) {
            newEntries.push([`__no_url_${counterRef.current++}`, job])
          } else if (!seenUrlsRef.current.has(key)) {
            seenUrlsRef.current.add(key)
            newEntries.push([key, job])
          }
        }
        if (newEntries.length > 0) {
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

      es.addEventListener('done', () => {
        didFinishRef.current = true
        setStreaming(false)
        setStreamDone(true)
        es.close()
        esRef.current = null
      })

      es.onerror = () => {
        if (didFinishRef.current) return
        setStreamErrors(prev => [
          ...prev,
          { id: `err-conn-${Date.now()}`, source: 'connection', message: 'Connection to search feed finished or timed out.' },
        ])
        setStreaming(false)
        setStreamDone(true)
        es.close()
        esRef.current = null
      }
    },
    [jobType, workMode]
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const finalTags = tagInput.trim() ? [...tags, tagInput.trim()] : tags
    if (tagInput.trim()) {
      setTags(finalTags)
      setTagInput('')
    }
    const finalLocations = locationInput.trim() ? [...locationTags, locationInput.trim()] : locationTags
    if (locationInput.trim()) {
      setLocationTags(finalLocations)
      setLocationInput('')
    }
    if (finalTags.length === 0 || finalLocations.length === 0) return
    offsetRef.current = 0
    openStream(finalTags, finalLocations, 0, false)
  }

  function handleLoadMore() {
    const newOffset = jobMap.size
    offsetRef.current = newOffset
    openStream(tags, locationTags, newOffset, true)
  }

  const jobs = [...jobMap.values()]
  const sites = [...new Set(jobs.map(j => j.site).filter(Boolean))] as string[]
  const canSearch = tags.length > 0 && locationTags.length > 0 && !streaming
  const showLoadMore = streamDone && jobs.length > 0 && !streaming
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      {!searched && (
        <section className="pt-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-200 mb-6 shadow-[0_0_20px_rgba(139,92,246,0.25)]">
            <Sparkles className="h-3.5 w-3.5 text-violet-300 animate-pulse" />
            Live AI Job Aggregator & Matcher
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight mb-4 bg-gradient-to-b from-white via-slate-100 to-violet-300 bg-clip-text text-transparent">
            Supercharge Your Job Search
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto mb-8 font-normal leading-relaxed">
            Real-time multi-platform aggregation from LinkedIn, Indeed, Naukri & Glassdoor — unified, deduplicated, and ranked.
          </p>

          {/* Supported sources chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {Object.entries(SITE_CONFIG).map(([site, cfg]) => (
              <span
                key={site}
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide ${cfg.color} shadow-sm`}
              >
                <span className={`h-2 w-2 rounded-full ${cfg.dot} shadow-[0_0_8px_currentColor]`} />
                {cfg.label}
              </span>
            ))}
          </div>

          {/* Pipeline flow visual */}
          <div className="mx-auto flex max-w-xl items-center justify-center gap-0 mb-4 px-4">
            {[
              { icon: Search, label: 'Search Roles', color: 'text-violet-300' },
              { icon: Filter, label: 'Multi-Source', color: 'text-blue-300' },
              { icon: Zap, label: 'Deduplicate', color: 'text-emerald-300' },
              { icon: Briefcase, label: 'Live Results', color: 'text-amber-300' },
            ].map(({ icon: Icon, label, color }, i) => (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_0_20px_rgba(139,92,246,0.15)] backdrop-blur-md">
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <span className="text-[11px] text-slate-300 font-semibold tracking-wide">{label}</span>
                </div>
                {i < 3 && (
                  <div className="w-8 sm:w-12 flex items-center justify-center -mt-5 shrink-0">
                    <ChevronRight className="h-4 w-4 text-violet-400/50" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI Streaming Banner */}
      {streaming && (
        <section
          aria-label="AI Search Progress"
          className="relative overflow-hidden rounded-3xl border border-violet-500/40 bg-gradient-to-br from-[#182038]/95 via-[#131b2e]/95 to-[#1a1c38]/95 p-6 sm:p-8 backdrop-blur-2xl shadow-[0_12px_48px_rgba(124,58,237,0.25)] animate-fade-up"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-violet-400 to-transparent animate-pulse" />
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-blue-600/15 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            {/* AI Core Animation Element */}
            <div className="flex items-center gap-5">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-violet-400/50 bg-violet-500/20 shadow-[0_0_30px_rgba(139,92,246,0.4)]">
                <div className="absolute h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_8px_#a78bfa] ai-orb-1" />
                <div className="absolute h-1.5 w-1.5 rounded-full bg-blue-300 shadow-[0_0_8px_#93c5fd] ai-orb-2" />
                <div className="absolute h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#6ee7b7] ai-orb-3" />
                <Bot className="h-8 w-8 text-violet-200 ai-pulse" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-200">
                    <Radio className="h-3 w-3 text-violet-300 animate-ping" />
                    AI Crawler Active
                  </span>
                  <span className="text-xs text-slate-400">Stream connected</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Synthesizing Live Job Feeds</span>
                </h3>
                <p className="text-sm text-violet-200/90 font-medium transition-all duration-300 mt-0.5">
                  {AI_PHASES[aiPhaseIdx]}
                </p>
              </div>
            </div>

            {/* Audio/Data Frequency Waveform & Live Metrics */}
            <div className="flex flex-wrap items-center gap-6 justify-center md:justify-end w-full md:w-auto">
              <div className="flex items-center gap-1 h-8 px-3 py-1 rounded-xl bg-black/30 border border-white/10" title="Data Stream Frequency">
                <span className="w-1 bg-violet-400 rounded-full wave-bar-1" />
                <span className="w-1 bg-violet-300 rounded-full wave-bar-2" />
                <span className="w-1 bg-indigo-400 rounded-full wave-bar-3" />
                <span className="w-1 bg-blue-400 rounded-full wave-bar-4" />
                <span className="w-1 bg-emerald-400 rounded-full wave-bar-5" />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 min-w-[90px]">
                  <span className="text-xs text-slate-400 font-medium">Batches</span>
                  <span className="text-lg font-bold text-violet-200">{sourcesChecked}</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 min-w-[90px]">
                  <span className="text-xs text-slate-400 font-medium">Jobs Found</span>
                  <span className="text-lg font-bold text-emerald-300">{jobs.length}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
      {/* Search Configuration Form */}
      <section aria-label="Job search filters">
        <form onSubmit={handleSubmit}>
          <div className="rounded-3xl border border-white/12 bg-[#12192b]/85 p-6 sm:p-7 shadow-[0_8px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Configure Search</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {tags.length > 0 && locationTags.length > 0
                  ? '✨ Ready to execute'
                  : 'Add role & location below'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {/* Role / Keywords */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    <Search className="h-3.5 w-3.5 text-violet-400" />
                    Role / Keywords
                  </label>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {tags.length}/{MAX_TAGS} • Press Enter or comma
                  </span>
                </div>

                <div
                  className={`flex flex-wrap items-center gap-2 min-h-[48px] rounded-2xl border px-3.5 py-2 transition-all cursor-text ${
                    tags.length >= MAX_TAGS
                      ? 'border-slate-600/50 bg-[#162035]/80 opacity-80'
                      : 'border-white/15 bg-[#162035]/80 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/20 shadow-inner'
                  }`}
                  onClick={() => document.getElementById('tag-input-field')?.focus()}
                  role="group"
                  aria-label="Keyword tags"
                >
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/20 px-2.5 py-1 text-[13px] font-semibold text-violet-200 shadow-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeTag(tag) }}
                        className="rounded p-0.5 text-violet-300 hover:text-white hover:bg-violet-500/30 transition-colors"
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {tags.length < MAX_TAGS && (
                    <input
                      id="tag-input-field"
                      type="text"
                      className="flex-1 min-w-[160px] bg-transparent text-sm font-medium text-white placeholder-slate-400 outline-none"
                      placeholder={tags.length === 0 ? 'e.g. React Developer, Software Engineer, Java...' : 'Add another keyword...'}
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={() => commitTag(tagInput)}
                      autoComplete="off"
                      disabled={streaming}
                    />
                  )}
                </div>

                {/* Quick suggestions for roles */}
                {tags.length < MAX_TAGS && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Suggestions:</span>
                    {SUGGESTED_ROLES.filter(r => !tags.includes(r)).slice(0, 4).map(role => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => commitTag(role)}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-200 transition-colors"
                      >
                        + {role}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                    Location
                  </label>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {locationTags.length}/{MAX_LOCATIONS} • Press Enter or comma
                  </span>
                </div>

                <div
                  className={`flex flex-wrap items-center gap-2 min-h-[48px] rounded-2xl border px-3.5 py-2 transition-all cursor-text ${
                    locationTags.length >= MAX_LOCATIONS
                      ? 'border-slate-600/50 bg-[#162035]/80 opacity-80'
                      : 'border-white/15 bg-[#162035]/80 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/20 shadow-inner'
                  }`}
                  onClick={() => document.getElementById('location-input-field')?.focus()}
                  role="group"
                  aria-label="Location tags"
                >
                  {locationTags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[13px] font-semibold text-emerald-200 shadow-sm"
                    >
                      <MapPin className="h-3 w-3 text-emerald-300" />
                      {tag}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removeLocationTag(tag) }}
                        className="rounded p-0.5 text-emerald-300 hover:text-white hover:bg-emerald-500/30 transition-colors"
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {locationTags.length < MAX_LOCATIONS && (
                    <input
                      id="location-input-field"
                      type="text"
                      className="flex-1 min-w-[160px] bg-transparent text-sm font-medium text-white placeholder-slate-400 outline-none"
                      placeholder={locationTags.length === 0 ? 'e.g. Remote, Bengaluru, Gurugram...' : 'Add another location...'}
                      value={locationInput}
                      onChange={e => setLocationInput(e.target.value)}
                      onKeyDown={handleLocationKeyDown}
                      onBlur={() => commitLocationTag(locationInput)}
                      autoComplete="off"
                      disabled={streaming}
                    />
                  )}
                </div>

                {/* Quick suggestions for locations */}
                {locationTags.length < MAX_LOCATIONS && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Suggestions:</span>
                    {SUGGESTED_LOCATIONS.filter(l => !locationTags.includes(l)).slice(0, 4).map(loc => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => commitLocationTag(loc)}
                        className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200 transition-colors"
                      >
                        + {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Type & Work Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" /> Job Type
                  </label>
                  <div className="relative">
                    <select
                      id="field-job-type"
                      value={jobType}
                      onChange={e => setJobType(e.target.value)}
                      disabled={streaming}
                      className="w-full h-[46px] appearance-none rounded-2xl border border-white/15 bg-[#162035] px-4 pr-10 text-sm font-medium text-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 transition-all shadow-inner"
                    >
                      <option value="" className="bg-[#111827]">Any Type</option>
                      <option value="fulltime" className="bg-[#111827]">Full-time</option>
                      <option value="parttime" className="bg-[#111827]">Part-time</option>
                      <option value="internship" className="bg-[#111827]">Internship</option>
                      <option value="contract" className="bg-[#111827]">Contract</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    <Laptop className="h-3.5 w-3.5 text-slate-400" /> Work Mode
                  </label>
                  <div className="relative">
                    <select
                      id="field-work-mode"
                      value={workMode}
                      onChange={e => setWorkMode(e.target.value)}
                      disabled={streaming}
                      className="w-full h-[46px] appearance-none rounded-2xl border border-white/15 bg-[#162035] px-4 pr-10 text-sm font-medium text-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 transition-all shadow-inner"
                    >
                      <option value="" className="bg-[#111827]">Any Mode</option>
                      <option value="remote" className="bg-[#111827]">Remote</option>
                      <option value="onsite" className="bg-[#111827]">Onsite / Hybrid</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-5">
              <p className="text-xs text-slate-400 text-center sm:text-left">
                {canSearch
                  ? `Configured: ${tags.length} role${tags.length !== 1 ? 's' : ''}, ${locationTags.length} location${locationTags.length !== 1 ? 's' : ''}`
                  : 'Add at least one role and one location to trigger AI search'}
              </p>
              <button
                id="btn-search-jobs"
                type="submit"
                disabled={!canSearch}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(139,92,246,0.4)] transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-[0_0_32px_rgba(139,92,246,0.6)] hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
              >
                {streaming ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    Searching Live...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-violet-200" />
                    Search Jobs
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>
      {/* Main Results Section */}
      <main>
        {/* Stream errors */}
        {streamErrors.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2" role="log">
            {streamErrors.map(err => (
              <span
                key={err.id}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200"
                title={err.message}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>{err.source}:</span>
                <span className="font-normal">{err.message.length > 60 ? err.message.slice(0, 57) + '...' : err.message}</span>
              </span>
            ))}
          </div>
        )}

        {/* Results */}
        {searched && (
          <>
            {jobs.length === 0 && streamDone ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04]">
                  <Search className="h-7 w-7 text-slate-400" />
                </div>
                <h3 className="font-bold text-lg text-white">No job postings found</h3>
                <p className="max-w-sm text-sm text-slate-400">
                  Try broader role titles or wider locations to aggregate more opportunities.
                </p>
              </div>
            ) : jobs.length > 0 ? (
              <div className="space-y-4">
                {/* Stats Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-1" aria-live="polite">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <p className="text-sm font-medium text-slate-300">
                      Discovered <strong className="text-white font-bold">{jobs.length}</strong> listing{jobs.length !== 1 ? 's' : ''}
                      {streaming && <span className="ml-2 text-xs font-semibold text-violet-300 animate-pulse">• streaming live</span>}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {sites.map(s => {
                      const cfg = SITE_CONFIG[s.toLowerCase()] ?? { color: 'text-slate-300 border-white/15 bg-white/5', dot: 'bg-slate-400', label: s }
                      return (
                        <span
                          key={s}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${cfg.color}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <JobsTable jobs={jobs} loading={streaming && jobs.length === 0} />

                {showLoadMore && (
                  <div className="mt-8 flex justify-center">
                    <button
                      id="btn-load-more"
                      type="button"
                      onClick={handleLoadMore}
                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/15 px-8 py-3 text-sm font-bold text-violet-200 transition-all hover:bg-violet-500/25 hover:border-violet-400/60 hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(139,92,246,0.2)]"
                    >
                      <ArrowDown className="h-4 w-4" />
                      Load More Results
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* Pre-search placeholder */}
        {!searched && !streaming && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/15 shadow-[0_0_30px_rgba(139,92,246,0.2)]">
              <Briefcase className="h-7 w-7 text-violet-300" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ready for your search</h3>
              <p className="max-w-sm text-sm text-slate-400 mt-1">
                Enter your desired role keywords and target cities above, then click Search Jobs to launch real-time multi-source crawlers.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}