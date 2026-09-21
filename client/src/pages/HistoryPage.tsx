import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import type { Job, PaginatedJobsResponse, FilterOption } from '../types'
import JobsTable from '../components/JobsTable'
import { SortDialog } from '../components/SortDialog'
import { MultiSelect } from '../components/MultiSelect'
import type { DateRange } from 'react-day-picker'
import {
  MapPin, X, Database,
  SlidersHorizontal, Inbox, AlertCircle, Briefcase, ChevronDown,
  Calendar, Clock, Building2, LayoutGrid
} from 'lucide-react'

const API_BASE_URL = (
  import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : import.meta.env.DEV ? 'http://localhost:8000' : ''
).replace(/\/$/, '')

const LIMIT = 25

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

  // Options
  const [availableRoles, setAvailableRoles] = useState<FilterOption[]>([])
  const [availableLocations, setAvailableLocations] = useState<FilterOption[]>([])
  const [availableCompanies, setAvailableCompanies] = useState<FilterOption[]>([])
  const [rolesSearching, setRolesSearching] = useState(false)
  const [locsSearching, setLocsSearching] = useState(false)
  const [compsSearching, setCompsSearching] = useState(false)

  // Filters
  const [roleFilter, setRoleFilter] = useState<string[]>(
    searchParams.get('roles') ? searchParams.get('roles')!.split(',').filter(Boolean) : []
  )
  const [locationFilter, setLocationFilter] = useState<string[]>(
    searchParams.get('locations') ? searchParams.get('locations')!.split(',').filter(Boolean) : []
  )
  const [companyFilter, setCompanyFilter] = useState<string[]>(
    searchParams.get('companies') ? searchParams.get('companies')!.split(',').filter(Boolean) : []
  )

  const initialPostedRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get('start_date'))
    const to = parseDateParam(searchParams.get('end_date'))
    return from ? { from, to } : undefined
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initialSearchedRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateParam(searchParams.get('searched_start_date'))
    const to = parseDateParam(searchParams.get('searched_end_date'))
    return from ? { from, to } : undefined
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [postedRange, setPostedRange] = useState<DateRange | undefined>(initialPostedRange)
  const [searchedRange, setSearchedRange] = useState<DateRange | undefined>(initialSearchedRange)

  // Jobs state (append-only)
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reqCounterRef = useRef(0)
  const rolesSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locsSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const compsSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch options
  const fetchOptions = useCallback((q?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    return fetch(`${API_BASE_URL}/api/history/options?${params}`)
      .then(r => r.json())
      .then(data => ({
        roles: (data.roles || []) as FilterOption[],
        locations: (data.locations || []) as FilterOption[],
        companies: (data.companies || []) as FilterOption[],
      }))
      .catch(() => ({ roles: [] as FilterOption[], locations: [] as FilterOption[], companies: [] as FilterOption[] }))
  }, [])

  useEffect(() => {
    fetchOptions().then(({ roles, locations, companies }) => {
      setAvailableRoles(roles)
      setAvailableLocations(locations)
      setAvailableCompanies(companies)
    })
  }, [fetchOptions])

  const makeSearchHandler = (
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    setSearching: (v: boolean) => void,
    setOptions: (v: FilterOption[]) => void,
    field: 'roles' | 'locations' | 'companies'
  ) => (q: string) => {
    if (!q.trim()) {
      setSearching(false)
      fetchOptions().then(data => setOptions(data[field]))
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      const data = await fetchOptions(q)
      setSearching(false)
      setOptions(data[field])
    }, 250)
  }

  const handleRolesSearch = makeSearchHandler(rolesSearchTimerRef, setRolesSearching, setAvailableRoles, 'roles')
  const handleLocsSearch = makeSearchHandler(locsSearchTimerRef, setLocsSearching, setAvailableLocations, 'locations')
  const handleCompsSearch = makeSearchHandler(compsSearchTimerRef, setCompsSearching, setAvailableCompanies, 'companies')

  const buildParams = useCallback((offset: number) => {
    const p = new URLSearchParams()
    p.append('limit', LIMIT.toString())
    p.append('offset', offset.toString())
    roleFilter.forEach(r => p.append('roles', r))
    locationFilter.forEach(l => p.append('locations', l))
    companyFilter.forEach(c => p.append('companies', c))
    if (postedRange?.from) p.append('start_date', format(postedRange.from, 'yyyy-MM-dd'))
    if (postedRange?.to) p.append('end_date', format(postedRange.to, 'yyyy-MM-dd'))
    if (searchedRange?.from) p.append('searched_start_date', format(searchedRange.from, 'yyyy-MM-dd'))
    if (searchedRange?.to) p.append('searched_end_date', format(searchedRange.to, 'yyyy-MM-dd'))
    return p
  }, [roleFilter, locationFilter, companyFilter, postedRange, searchedRange])

  // Initial / filter-reset fetch
  useEffect(() => {
    const thisReq = ++reqCounterRef.current
    setLoading(true)
    setError(null)
    setJobs([])
    setTotal(0)
    setHasMore(false)

    const params = buildParams(0)
    const urlP = new URLSearchParams()
    if (roleFilter.length) urlP.set('roles', roleFilter.join(','))
    if (locationFilter.length) urlP.set('locations', locationFilter.join(','))
    if (companyFilter.length) urlP.set('companies', companyFilter.join(','))
    if (postedRange?.from) urlP.set('start_date', format(postedRange.from, 'yyyy-MM-dd'))
    if (postedRange?.to) urlP.set('end_date', format(postedRange.to, 'yyyy-MM-dd'))
    if (searchedRange?.from) urlP.set('searched_start_date', format(searchedRange.from, 'yyyy-MM-dd'))
    if (searchedRange?.to) urlP.set('searched_end_date', format(searchedRange.to, 'yyyy-MM-dd'))
    setSearchParams(urlP, { replace: true })

    fetch(`${API_BASE_URL}/api/history/all_jobs?${params}`)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch jobs'); return r.json() as Promise<PaginatedJobsResponse> })
      .then(data => {
        if (thisReq !== reqCounterRef.current) return
        setJobs(data.data); setTotal(data.total); setHasMore(data.has_more); setError(null)
      })
      .catch(err => { if (thisReq !== reqCounterRef.current) return; setError(err.message) })
      .finally(() => { if (thisReq === reqCounterRef.current) setLoading(false) })
  }, [roleFilter, locationFilter, companyFilter, postedRange, searchedRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    const thisReq = ++reqCounterRef.current
    setLoadingMore(true)
    const params = buildParams(jobs.length)
    fetch(`${API_BASE_URL}/api/history/all_jobs?${params}`)
      .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json() as Promise<PaginatedJobsResponse> })
      .then(data => {
        if (thisReq !== reqCounterRef.current) return
        setJobs(prev => [...prev, ...data.data]); setTotal(data.total); setHasMore(data.has_more)
      })
      .catch(err => { if (thisReq !== reqCounterRef.current) return; setError(err.message) })
      .finally(() => { if (thisReq === reqCounterRef.current) setLoadingMore(false) })
  }, [loadingMore, hasMore, jobs.length, buildParams])

  const hasFilters = roleFilter.length > 0 || locationFilter.length > 0 || companyFilter.length > 0 ||
    Boolean(postedRange?.from) || Boolean(searchedRange?.from)

  const clearAll = () => {
    setRoleFilter([]); setLocationFilter([]); setCompanyFilter([])
    setPostedRange(undefined); setSearchedRange(undefined)
  }

  const activeFilterCount = roleFilter.length + locationFilter.length + companyFilter.length +
    (postedRange?.from ? 1 : 0) + (searchedRange?.from ? 1 : 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-500/25">
            <Database className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">All Jobs</h1>
            <p className="text-sm text-slate-400">Browse and filter every collected listing</p>
          </div>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2">
            <LayoutGrid className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">{total.toLocaleString()}</span>
            <span className="text-sm text-slate-400">total</span>
          </div>
        )}
      </section>

      {/* Filters card */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl shadow-[0_4px_32px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-200">Filters</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-violet-500/25 border border-violet-500/30 px-2 py-0.5 text-[11px] font-bold text-violet-300">
                {activeFilterCount}
              </span>
            )}
          </div>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-400 transition-all hover:border-rose-500/40 hover:bg-rose-500/15"
            >
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        {/* Row 1: Role, Location, Company */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              <Briefcase className="h-3 w-3" /> Title / Role
            </label>
            <MultiSelect
              options={availableRoles}
              selected={roleFilter}
              onChange={setRoleFilter}
              placeholder="Filter by role..."
              variant="violet"
              onSearch={handleRolesSearch}
              searching={rolesSearching}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              <MapPin className="h-3 w-3" /> Location
            </label>
            <MultiSelect
              options={availableLocations}
              selected={locationFilter}
              onChange={setLocationFilter}
              placeholder="Filter by location..."
              variant="emerald"
              onSearch={handleLocsSearch}
              searching={locsSearching}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              <Building2 className="h-3 w-3" /> Company
            </label>
            <MultiSelect
              options={availableCompanies}
              selected={companyFilter}
              onChange={setCompanyFilter}
              placeholder="Filter by company..."
              variant="amber"
              onSearch={handleCompsSearch}
              searching={compsSearching}
            />
          </div>
        </div>

        {/* Row 2: Date sort dialogs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-white/8 pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              <Calendar className="h-3 w-3" /> Posted Date
            </label>
            <SortDialog
              label="Any posted date"
              value={postedRange}
              onChange={setPostedRange}
              icon={<Calendar className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              <Clock className="h-3 w-3" /> Searched On
            </label>
            <SortDialog
              label="Any searched date"
              value={searchedRange}
              onChange={setSearchedRange}
              icon={<Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            />
          </div>
        </div>
      </section>

      {/* Results */}
      <section>
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {loading && jobs.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <span className="h-9 w-9 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
            <p className="text-sm text-slate-500">Loading jobs...</p>
          </div>
        )}

        {!loading && jobs.length === 0 && !error && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
              <Inbox className="h-7 w-7 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200">No jobs found</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Try adjusting your filters or clearing the date range.</p>
            </div>
          </div>
        )}

        {jobs.length > 0 && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
              <p className="text-sm text-slate-400">
                Showing <strong className="text-white">{jobs.length}</strong> of{' '}
                <strong className="text-white">{total.toLocaleString()}</strong> jobs
                {loading && <span className="ml-2 inline-block h-3.5 w-3.5 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin align-middle" />}
              </p>
            </div>

            <JobsTable jobs={jobs} loading={loading} />

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className={[
                    "inline-flex items-center gap-2.5 rounded-xl px-8 py-3",
                    "border border-violet-500/30 bg-violet-500/10 text-sm font-semibold text-violet-300",
                    "transition-all hover:border-violet-500/50 hover:bg-violet-500/15 hover:-translate-y-0.5",
                    "shadow-[0_4px_20px_rgba(124,58,237,0.15)]",
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0",
                  ].join(" ")}
                >
                  {loadingMore ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-violet-500/30 border-t-violet-400 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Load More ({(total - jobs.length).toLocaleString()} remaining)
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}