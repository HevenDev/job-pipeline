import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Job } from '../types'
import JobsTable from '../components/JobsTable'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    
    setLoading(true)
    fetch(`${API_BASE_URL}/api/history/${id}/jobs`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch jobs')
        return res.json()
      })
      .then(data => {
        setJobs(data)
        setError(null)
      })
      .catch(err => {
        setError(err.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return <main><div className="state-box">Loading jobs...</div></main>
  }

  if (error) {
    return <main><div className="state-box"><h3>Error</h3><p>{error}</p></div></main>
  }

  return (
    <main>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/history" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>
          &larr; Back to History
        </Link>
      </div>
      
      <div className="results-meta" aria-live="polite">
        <p className="results-count">
          Showing <strong>{jobs.length}</strong> matched job{jobs.length !== 1 ? 's' : ''} for this search.
        </p>
      </div>

      <JobsTable jobs={jobs} />
    </main>
  )
}
