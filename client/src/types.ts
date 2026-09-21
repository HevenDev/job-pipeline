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
  search_ids?: string[]
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

/** Option returned by /api/history/options */
export interface FilterOption {
  value: string   // normalised (lowercase + trimmed) - used as filter key
  label: string   // display text (original casing)
  count: number
}

/** Recent search with job_count from /api/history/recent */
export interface RecentSearch extends SearchHistory {
  job_count: number
}

export interface PaginatedJobsResponse {
  data: Job[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  page: number
}

/** Date preset for sort/filter dialogs */
export type DatePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'