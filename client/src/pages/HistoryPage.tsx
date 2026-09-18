import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SearchHistory } from '../types'
import { formatDate } from '../utils'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export default function HistoryPage() {
  const [history, setHistory] = useState<SearchHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [roleFilter, setRoleFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [jobType, setJobType] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Debounce string filters
  const [debouncedRole, setDebouncedRole] = useState('')
  const [debouncedLocation, setDebouncedLocation] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedRole(roleFilter)
      setDebouncedLocation(locationFilter)
    }, 400)
    return () => clearTimeout(t)
  }, [roleFilter, locationFilter])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedRole) params.append('role', debouncedRole)
    if (debouncedLocation) params.append('location', debouncedLocation)
    if (jobType) params.append('job_type', jobType)
    if (sourceFilter) params.append('source', sourceFilter)
    if (dateFrom) params.append('start_date', new Date(dateFrom).toISOString())
    
    let toDateStr = ''
    if (dateTo) {
      // End of day
      const d = new Date(dateTo)
      d.setHours(23, 59, 59, 999)
      toDateStr = d.toISOString()
      params.append('end_date', toDateStr)
    }

    fetch(`${API_BASE_URL}/api/history?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch history')
        return res.json()
      })
      .then(data => {
        setHistory(data)
        setError(null)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [debouncedRole, debouncedLocation, jobType, sourceFilter, dateFrom, dateTo])

  return (
    <main>
      <section aria-label="History filters">
        <div className="search-card">
          <div className="search-grid">
            <div className="field-group">
              <label>Role / Keyword</label>
              <input
                type="text"
                className="tag-inner-input"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333' }}
                placeholder="Filter by role..."
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label>Location</label>
              <input
                type="text"
                className="tag-inner-input"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333' }}
                placeholder="Filter by location..."
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label>Job Type</label>
              <select
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

            <div className="field-group">
              <label>Source</label>
              <select
                value={sourceFilter}
                onChange={e => setSourceFilter(e.target.value)}
              >
                <option value="">Any</option>
                <option value="live_stream">Live Stream</option>
                <option value="seed_import">Seed Import</option>
              </select>
            </div>
            
            <div className="field-group">
              <label>From Date</label>
              <input
                type="date"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: 'var(--bg)', color: 'var(--fg)' }}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
              />
            </div>
            
            <div className="field-group">
              <label>To Date</label>
              <input
                type="date"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #333', background: 'var(--bg)', color: 'var(--fg)' }}
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: '2rem' }}>
        {error && <div className="state-box"><h3>Error</h3><p>{error}</p></div>}
        
        {loading && !history.length && <div className="state-box">Loading history...</div>}

        {!loading && history.length === 0 && !error && (
          <div className="state-box">
            <h3>No history found</h3>
            <p>Try adjusting your filters.</p>
          </div>
        )}

        {history.length > 0 && (
          <div className="jobs-table-wrap">
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Roles</th>
                  <th>Locations</th>
                  <th>Jobs (New)</th>
                  <th>Source</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.search_id}>
                    <td>{formatDate(h.started_at)}</td>
                    <td>{h.roles.join(', ')}</td>
                    <td>{h.locations.join(', ')}</td>
                    <td>
                      {h.total_matched} 
                      {h.new_job_count > 0 && <span style={{ color: 'var(--success)', marginLeft: '4px' }}>(+{h.new_job_count})</span>}
                    </td>
                    <td>
                      <span className={`site-badge ${h.source === 'seed_import' ? 'naukri' : 'linkedin'}`}>
                        {h.source === 'seed_import' ? 'Seeded' : 'Live'}
                      </span>
                      {h.cache_hit && <span className="site-badge indeed" style={{ marginLeft: '4px' }}>Cached</span>}
                    </td>
                    <td>
                      <Link to={`/history/${h.search_id}`} className="btn-view">
                        View Jobs
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
