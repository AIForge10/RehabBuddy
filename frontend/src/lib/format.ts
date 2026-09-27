export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso)) / 1000
  if (diff < 45) return 'just now'
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`
  const days = Math.round(diff / 86_400)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/** "Sep 26", or "26 sept" in Spanish (es-ES). */
export function shortDate(iso: string, locale = 'en-US'): string {
  return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
