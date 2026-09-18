import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Job, PaginatedJobsResponse } from '../types'
import JobsTable from '../components/JobsTable'
import { DatePicker } from '../components/DatePicker'
import { MultiSelect } from '../components/MultiSelect'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Tag cloud state
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [availableLocations, setAvailableLocations] = useState<string[]>([])
  
  // Filter state
  const [roleFilter, setRoleFilter] = useState<string[]>(
    searchParams.get('role') ? searchParams.get('role')!.split(',') : []
  )
  const [locationFilter, setLocationFilter] = useState<string[]>(
    searchParams.get('location') ? searchParams.get('location')!.split(',') : []
  )
  const [startDate, setStartDate] = useState<Date | undefined>(
    searchParams.get('start_date') ? new Date(searchParams.get('start_date')!) : undefined
  )
  const [endDate, setEndDate] = useState<Date | undefined>(
    searchParams.get('end_date') ? new Date(searchParams.get('end_date')!) : undefined
  )
  
  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch unique tags for the cloud
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/history/tags`)
      .then(res => res.json())
      .then(data => {
        setAvailableRoles(data.roles || [])
        setAvailableLocations(data.locations || [])
      })
      .catch(console.error)
  }, [])

  // Fetch paginated jobs when filters change
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('limit', limit.toString())
    if (roleFilter.length > 0) params.append('role', roleFilter.join(','))
    if (locationFilter.length > 0) params.append('location', locationFilter.join(','))
    if (startDate) params.append('start_date', startDate.toISOString())
    if (endDate) params.append('end_date', endDate.toISOString())
    
    // Sync to URL
    setSearchParams(params, { replace: true })

    fetch(`${API_BASE_URL}/api/history/all_jobs?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch jobs')
        return res.json() as Promise<PaginatedJobsResponse>
      })
      .then(data => {
        setJobs(data.data)
        setTotal(data.total)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [roleFilter, locationFilter, startDate, endDate, page, limit, setSearchParams])

  const totalPages = Math.ceil(total / limit)

  return (
    <main>
      <section aria-label="History search and filters" className="mb-8">
        <h2 className="mb-6 text-2xl font-bold">Master Jobs Database</h2>
        
        <div className="search-card p-6">
          {/* Main Search Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="field-group">
              <label className="font-semibold">Title or Role</label>
              <MultiSelect
                options={availableRoles}
                selected={roleFilter}
                onChange={val => { setRoleFilter(val); setPage(1); }}
                placeholder="Select roles..."
              />
            </div>

            <div className="field-group">
              <label className="font-semibold">Location</label>
              <MultiSelect
                options={availableLocations}
                selected={locationFilter}
                onChange={val => { setLocationFilter(val); setPage(1); }}
                placeholder="Select locations..."
              />
            </div>
          </div>
          
          {/* Shadcn Date Pickers */}
          <div className="flex flex-wrap items-end gap-4 border-t border-[#333] pt-6">
            <div className="field-group flex-1 min-w-[200px]">
              <label className="text-[0.9rem] text-[#ccc]">Found After</label>
              <DatePicker 
                date={startDate} 
                setDate={d => { setStartDate(d); setPage(1); }} 
                placeholder="Start date" 
              />
            </div>
            
            <div className="field-group flex-1 min-w-[200px]">
              <label className="text-[0.9rem] text-[#ccc]">Found Before</label>
              <DatePicker 
                date={endDate} 
                setDate={d => { setEndDate(d); setPage(1); }} 
                placeholder="End date" 
              />
            </div>
            
            <div className="flex-1 flex justify-end">
               <button 
                  className="btn-view h-[44px]"
                  onClick={() => {
                    setRoleFilter([]);
                    setLocationFilter([]);
                    setStartDate(undefined);
                    setEndDate(undefined);
                    setPage(1);
                  }}
               >
                 Clear Filters
               </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        {error && <div className="state-box"><h3>Error</h3><p>{error}</p></div>}
        
        {loading && jobs.length === 0 && <div className="state-box">Loading database...</div>}
        
        {!loading && jobs.length === 0 && !error && (
          <div className="state-box">
            <span className="state-icon">📭</span>
            <h3>No jobs found</h3>
            <p>Try adjusting your filters or date range.</p>
          </div>
        )}
        
        {jobs.length > 0 && (
          <>
            <div className="results-meta flex justify-between items-center" aria-live="polite">
              <p className="results-count">
                Showing <strong>{jobs.length}</strong> of <strong>{total}</strong> jobs from your history.
              </p>
              
              <div className="flex items-center gap-4">
                <select 
                  value={limit} 
                  onChange={e => {
                    setLimit(Number(e.target.value))
                    setPage(1)
                  }}
                  disabled={loading}
                  className="bg-[var(--bg-card)] text-[var(--fg)] border border-[var(--border)] p-1 rounded"
                >
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="75">75 per page</option>
                  <option value="100">100 per page</option>
                </select>
                
                <div className="flex gap-2">
                  <button 
                    className="btn-view"
                    disabled={page === 1 || loading}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="self-center text-sm">Page {page} of {totalPages || 1}</span>
                  <button 
                    className="btn-view"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            <JobsTable jobs={jobs} />
          </>
        )}
      </section>
    </main>
  )
}
