import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import type { Job, PaginatedJobsResponse, SearchHistory } from '../types'
import { formatDate } from '../utils'
import JobsTable from '../components/JobsTable'
import { DateRangePicker } from '../components/DateRangePicker'
import { MultiSelect } from '../components/MultiSelect'
import type { DateRange } from 'react-day-picker'
import {
  MapPin, Calendar, X, ChevronLeft, ChevronRight,
  Database, SlidersHorizontal, Clock, Inbox, AlertCircle, Briefcase
} from 'lucide-react'

const API_BASE_URL = (import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : (import.meta.env.DEV ? 'http://localhost:8000' : '')).replace(/\/$/, '')

const parseDateParam = (val: string | null): Date | undefined => {
  if (!val) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const parsed = new Date(val)
  return isNaN(parsed.getTime()) ? undefined : parsed
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [availableLocations, setAvailableLocations] = useState<string[]>([])

  const [roleFilter, setRoleFilter] = useState<string[]>(
    searchParams.get('role') ? searchParams.get('role')!.split(',') : []
  )
  const [locationFilter, setLocationFilter] = useState<string[]>(
    searchParams.get('location') ? searchParams.get('location')!.split(',') : []
  )

  const initialPostedRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get('start_date'))
    const to = parseDateParam(searchParams.get('end_date'))
    if (from) return { from, to }
    return undefined
  }, []) // run once on mount

  const initialSearchedRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get('searched_start_date'))
    const to = parseDateParam(searchParams.get('searched_end_date'))
    if (from) return { from, to }
    return undefined
  }, []) // run once on mount

  const [postedRange, setPostedRange] = useState<DateRange | undefined>(initialPostedRange)
  const [searchedRange, setSearchedRange] = useState<DateRange | undefined>(initialSearchedRange)

  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/history?limit=3`)
      .then(res => res.json())
      .then(data => { if (data?.history) setRecentSearches(data.history) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/history/tags`)
      .then(res => res.json())
      .then(data => { setAvailableRoles(data.roles || []); setAvailableLocations(data.locations || []) })
      .catch(console.error)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', limit.toString())
    if (roleFilter.length > 0) params.append('role', roleFilter.join(','))
    if (locationFilter.length > 0) params.append('location', locationFilter.join(','))
    if (postedRange?.from) params.append('start_date', format(postedRange.from, 'yyyy-MM-dd'))
    if (postedRange?.to) params.append('end_date', format(postedRange.to, 'yyyy-MM-dd'))
    if (searchedRange?.from) params.append('searched_start_date', format(searchedRange.from, 'yyyy-MM-dd'))
    if (searchedRange?.to) params.append('searched_end_date', format(searchedRange.to, 'yyyy-MM-dd'))
    setSearchParams(params, { replace: true })

    fetch(`${API_BASE_URL}/api/history/all_jobs?${params.toString()}`)
      .then(res => { if (!res.ok) throw new Error('Failed to fetch jobs'); return res.json() as Promise<PaginatedJobsResponse> })
      .then(data => { setJobs(data.data); setTotal(data.total); setError(null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [roleFilter, locationFilter, postedRange, searchedRange, page, limit, setSearchParams])

  const totalPages = Math.ceil(total / limit)
  const hasFilters = roleFilter.length > 0 || locationFilter.length > 0 || Boolean(postedRange?.from) || Boolean(searchedRange?.from)

  function clearFilters() {
    setRoleFilter([])
    setLocationFilter([])
    setPostedRange(undefined)
    setSearchedRange(undefined)
    setPage(1)
  }

  return (
    <div className="space-y-8">
      {/* ── Recent Searches ── */}
      {recentSearches.length > 0 && (
        <section aria-label="Recent Searches">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Recent Searches</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {recentSearches.map(h => (
              <button
                key={h.search_id}
                onClick={() => {
                  setRoleFilter(h.roles || [])
                  setLocationFilter(h.locations || [])
                  setSearchedRange({ from: new Date(h.started_at), to: new Date(h.started_at) })
                  setPostedRange(undefined)
                  setPage(1)
                }}
                className="group text-left rounded-xl border border-violet-500/10 bg-white/[0.03] p-4 transition-all hover:border-violet-500/25 hover:bg-white/[0.06] hover:shadow-[0_0_16px_rgba(139,92,246,0.1)]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <strong className="text-[13px] font-semibold text-slate-200 leading-snug line-clamp-1">
                    {h.roles.join(', ') || 'Any Role'}
                  </strong>
                  {h.total_matched > 0 ? (
                    <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      {h.total_matched}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-slate-700 bg-white/5 px-2 py-0.5 text-[11px] text-slate-600">0</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500 mb-3">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{h.locations.join(', ') || 'Any Location'}</span>
                </div>
                <div className="flex items-center gap-1 border-t border-white/5 pt-2.5 text-[11px] text-slate-600">
                  <Calendar className="h-3 w-3 shrink-0" />
                  Searched: {formatDate(h.started_at)}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <section aria-label="Filter jobs">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Master Jobs Database</h2>
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-slate-600 hover:text-slate-200"
            >
              <X className="h-3 w-3" /> Clear Filters
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-violet-500/10 bg-white/[0.03] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-widest text-slate-600">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </div>

          {/* Row 1: Role & Location MultiSelects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                <Briefcase className="h-3 w-3" /> Title or Role
              </label>
              <MultiSelect
                options={availableRoles}
                selected={roleFilter}
                onChange={val => { setRoleFilter(val); setPage(1) }}
                placeholder="Select roles…"
                variant="violet"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                <MapPin className="h-3 w-3" /> Location
              </label>
              <MultiSelect
                options={availableLocations}
                selected={locationFilter}
                onChange={val => { setLocationFilter(val); setPage(1) }}
                placeholder="Select locations…"
                variant="emerald"
              />
            </div>
          </div>

          {/* Row 2: Date Range Pickers (Posted Date Range & Searched On Date Range) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-violet-500/10 pt-4">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                <Calendar className="h-3 w-3" /> Posted Date Range
              </label>
              <DateRangePicker
                value={postedRange}
                onChange={range => { setPostedRange(range); setPage(1) }}
                placeholder="Pick posted date range…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                <Clock className="h-3 w-3" /> Searched On Date Range
              </label>
              <DateRangePicker
                value={searchedRange}
                onChange={range => { setSearchedRange(range); setPage(1) }}
                placeholder="Pick searched date range…"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Results ── */}
      <section>
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && jobs.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <span className="h-8 w-8 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
            <p className="text-sm text-slate-500">Loading database…</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && jobs.length === 0 && !error && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-white/[0.03]">
              <Inbox className="h-6 w-6 text-slate-600" />
            </div>
            <h3 className="font-semibold text-slate-300">No jobs found</h3>
            <p className="max-w-sm text-sm text-slate-500">Try adjusting your filters or clearing the date range.</p>
          </div>
        )}

        {/* Table + pagination */}
        {jobs.length > 0 && (
          <>
            {/* Results meta + pagination */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
              <p className="text-sm text-slate-400">
                Showing <strong className="text-violet-300">{jobs.length}</strong> of <strong className="text-violet-300">{total}</strong> jobs
                {loading && <span className="ml-2 inline-block h-3.5 w-3.5 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin align-middle" />}
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1) }}
                  disabled={loading}
                  className="h-8 appearance-none rounded-lg border border-violet-500/20 bg-white/[0.04] px-3 pr-6 text-xs text-slate-300 focus:outline-none focus:border-violet-500/40 disabled:opacity-50 transition-all"
                >
                  {[25, 50, 75, 100].map(n => <option key={n} value={n} className="bg-[#161b2e]">{n} per page</option>)}
                </select>

                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-white/[0.04] text-slate-400 transition-all hover:border-violet-500/40 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page === 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500 whitespace-nowrap">{page} / {totalPages || 1}</span>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-white/[0.04] text-slate-400 transition-all hover:border-violet-500/40 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <JobsTable jobs={jobs} loading={loading} />

            {/* Bottom pagination */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-white/[0.04] text-slate-400 transition-all hover:border-violet-500/40 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page === 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">{page} / {totalPages || 1}</span>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 bg-white/[0.04] text-slate-400 transition-all hover:border-violet-500/40 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={page >= totalPages || loading}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
