import type { Job } from '../types'
import { formatDate, normaliseSite, formatJobType } from '../utils'

interface JobsTableProps {
  jobs: Job[]
}

export default function JobsTable({ jobs }: JobsTableProps) {
  return (
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
  )
}
