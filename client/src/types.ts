export interface Job {
  id?: string
  title?: string
  company?: string
  location?: string
  job_type?: string
  is_remote?: boolean | null
  date_posted?: string | null
  job_url?: string | null
  site?: string
  matched_location?: string | null
  first_seen_at?: string | null
  created_at?: string | null
}

export interface SearchHistory {
  search_id: string
  roles: string[]
  locations: string[]
  job_type: string | null
  is_remote: boolean | null
  hours_old: number | null
  started_at: string
  ended_at: string | null
  status: string
  source: string
  total_matched: number
  new_job_count: number
  duplicate_job_count: number
  cache_hit: boolean
}

export interface PaginatedJobsResponse {
  data: Job[]
  total: number
  page: number
  limit: number
}
