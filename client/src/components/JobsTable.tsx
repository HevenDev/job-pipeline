import type { Job } from '../types'
import { formatDate, normaliseSite, formatJobType } from '../utils'
import { MapPin, ExternalLink, Building2, Clock, Inbox } from 'lucide-react'

const SITE_STYLE: Record<string, { badge: string; dot: string; label: string }> = {
  linkedin:      { badge: 'text-blue-300 border-blue-400/40 bg-blue-500/15',          dot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]',    label: 'LinkedIn' },
  indeed:        { badge: 'text-emerald-300 border-emerald-400/40 bg-emerald-500/15', dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]', label: 'Indeed' },
  naukri:        { badge: 'text-amber-300 border-amber-400/40 bg-amber-500/15',       dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]',    label: 'Naukri' },
  glassdoor:     { badge: 'text-violet-300 border-violet-400/40 bg-violet-500/15',    dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]',  label: 'Glassdoor' },
  zip_recruiter: { badge: 'text-rose-300 border-rose-400/40 bg-rose-500/15',          dot: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]',    label: 'ZipRecruiter' },
}

const FALLBACK_SITE = { badge: 'text-slate-300 border-slate-600/50 bg-slate-800/40', dot: 'bg-slate-400', label: '' }

interface JobsTableProps {
  jobs: Job[]
  loading?: boolean
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/[0.06]">
      {[220, 140, 140, 80, 80, 90, 60].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="skeleton h-4 rounded-md" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

function MobileJobCard({ job, idx }: { job: Job; idx: number }) {
  const site = normaliseSite(job.site ?? '')
  const s = SITE_STYLE[site] ?? FALLBACK_SITE
  const isRemote = job.is_remote
  const jobType = formatJobType(job.job_type, job.is_remote)
  const showBadge = job.matched_location &&
    !job.location?.toLowerCase().includes(job.matched_location.toLowerCase())

  return (
    <div
      className="rounded-2xl border border-white/12 bg-[#131b2e]/80 p-4 transition-all duration-200 hover:border-violet-500/40 hover:bg-[#18223a]/90 hover:shadow-lg shadow-[0_4px_20px_rgba(0,0,0,0.25)] animate-fade-up"
      style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
    >
      {/* Title + link */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="font-semibold text-white leading-snug">{job.title ?? '—'}</span>
        {job.job_url && (
          <a
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-violet-500/20 px-2.5 py-1 text-[12px] font-semibold text-violet-200 transition-all hover:bg-violet-500/30 hover:border-violet-400/60 shadow-[0_0_10px_rgba(139,92,246,0.2)]"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Company */}
      <div className="flex items-center gap-1.5 text-[13px] text-slate-300 mb-2">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span className="font-medium">{job.company ?? '—'}</span>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-[13px] text-slate-300 mb-3">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <span>{job.location ?? '—'}</span>
        {showBadge && (
          <span className="rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 text-[10px] font-semibold text-violet-300">
            {job.matched_location}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
        {/* Type */}
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
          isRemote
            ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
            : 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
        }`}>{jobType}</span>

        {/* Source */}
        {job.site && (
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label || job.site}
          </span>
        )}

        {/* Posted & Searched */}
        <div className="ml-auto text-right">
          {job.date_posted && (
            <span className="flex items-center justify-end gap-1 text-[12px] text-slate-300 font-medium">
              <Clock className="h-3 w-3 text-slate-400" />{formatDate(job.date_posted)}
            </span>
          )}
          {(job.first_seen_at || job.created_at) && (
            <span className="text-[10px] text-slate-400 block">
              Searched: {formatDate(job.first_seen_at || job.created_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JobsTable({ jobs, loading }: JobsTableProps) {
  if (loading && jobs.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#12192b]/80 shadow-[0_4px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full text-sm" aria-label="Loading job listings">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {['Title', 'Company', 'Location', 'Type', 'Posted', 'Source', 'Link'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
        {/* Mobile skeletons */}
        <div className="sm:hidden space-y-3 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-2.5">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-3.5 w-1/2" />
              <div className="skeleton h-3.5 w-2/3" />
              <div className="flex gap-2"><div className="skeleton h-5 w-20" /><div className="skeleton h-5 w-16" /></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] shadow-sm">
          <Inbox className="h-6 w-6 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-200">No jobs found</h3>
        <p className="max-w-xs text-sm text-slate-400">
          No results match your current filters — try broader roles or clear the date range.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop table (sm+) */}
      <div className="hidden sm:block overflow-hidden rounded-2xl border border-white/12 bg-[#12192b]/85 shadow-[0_4px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Job listings">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04]">
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">Title</span>
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 whitespace-nowrap">
                  <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-violet-400" /> Company</span>
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 whitespace-nowrap">
                  <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-emerald-400" /> Location</span>
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300">Type</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300 whitespace-nowrap">
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /> Posted</span>
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300">Source</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-300">Link</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, idx) => {
                const site = normaliseSite(job.site ?? '')
                const s = SITE_STYLE[site] ?? FALLBACK_SITE
                const isRemote = job.is_remote
                const jobType = formatJobType(job.job_type, job.is_remote)
                const showBadge = job.matched_location &&
                  !job.location?.toLowerCase().includes(job.matched_location.toLowerCase())

                return (
                  <tr
                    key={job.job_url || `no-url-${idx}`}
                    className="border-b border-white/[0.06] last:border-0 transition-colors duration-150 hover:bg-violet-500/[0.08] animate-fade-up"
                    style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                  >
                    {/* Title */}
                    <td className="px-4 py-3.5 max-w-[220px]">
                      <span className="font-semibold text-white leading-snug line-clamp-2">{job.title ?? '—'}</span>
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3.5 max-w-[150px]">
                      <span className="text-slate-300 text-[13px] font-medium truncate block">{job.company ?? '—'}</span>
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3.5 max-w-[160px]">
                      <div className="flex items-start gap-1 text-slate-300 text-[13px]">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-400/80" />
                        <span className="truncate">
                          {job.location ?? '—'}
                          {showBadge && (
                            <span className="ml-1.5 inline-block rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 py-0 text-[10px] font-semibold text-violet-300 align-middle">
                              {job.matched_location}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold ${
                        isRemote
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200'
                      }`}>{jobType}</span>
                    </td>

                    {/* Posted & Searched */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-[13px] text-slate-300">
                      <div className="font-medium text-slate-200">{formatDate(job.date_posted)}</div>
                      {(job.first_seen_at || job.created_at) && (
                        <div className="text-[11px] text-slate-400 font-normal">
                          Searched: {formatDate(job.first_seen_at || job.created_at)}
                        </div>
                      )}
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {job.site && (
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                          {s.label || job.site}
                        </span>
                      )}
                    </td>

                    {/* Link */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {job.job_url ? (
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200 transition-all hover:bg-violet-500/30 hover:border-violet-400/60 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                        >
                          Apply <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards (sm-) */}
      <div className="sm:hidden space-y-3">
        {jobs.map((job, idx) => (
          <MobileJobCard key={job.job_url || `mob-${idx}`} job={job} idx={idx} />
        ))}
      </div>
    </>
  )
}