export function formatDate(raw?: string | null): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function normaliseSite(site?: string): string {
  if (!site) return ''
  return site.toLowerCase().replace(/\s+/g, '_')
}

export function formatJobType(type?: string | null, isRemote?: boolean | null): string {
  if (!type && isRemote == null) return '—'
  const parts: string[] = []
  if (type) parts.push(type.charAt(0).toUpperCase() + type.slice(1))
  if (isRemote === true) parts.push('Remote')
  return parts.join(' · ') || '—'
}
