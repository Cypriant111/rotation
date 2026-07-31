const num = new Intl.NumberFormat('en-US')

export function fmtInt(n: number): string {
  return num.format(Math.round(n))
}

/** 4,182 -> "4,182" ; 12,900 -> "12.9K" (for tight spots) */
export function fmtCompact(n: number): string {
  if (n < 10_000) return num.format(Math.round(n))
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** ms -> whole minutes */
export function msToMin(ms: number): number {
  return Math.round(ms / 60_000)
}

/** "3h 24m" for durations under a day-ish, else "142 hr" */
export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 100) return `${h}h ${min % 60}m`
  return `${num.format(h)} hr`
}

export function fmtDay(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* Day-key formatters: day keys are UTC midnights of local calendar dates,
   so they must render in UTC or they shift a day in western timezones. */

export function fmtDayKey(key: number): string {
  return new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function fmtDayKeyFull(key: number): string {
  return new Date(key).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export function weekdayNarrow(key: number): string {
  return new Date(key).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' })
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** "2m ago", "3h ago", "Jul 12" */
export function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return fmtDay(ts)
}
