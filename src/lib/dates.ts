export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Local-midnight Monday of the week containing `now`, shifted by `weekOffset` weeks. */
export function mondayOf(now: Date, weekOffset = 0): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7)
  return d
}

/** `YYYY-MM-DD` in local time — the key format the prototype stores in `log`. */
export function dateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(d.getDate() + days)
  return out
}

/** The seven dates Mon–Sun starting at `monday`. */
export function weekDates(monday: Date): Date[] {
  return DAY_NAMES.map((_, i) => addDays(monday, i))
}

/** "Oct 19" */
export function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Oct 19 – Oct 25, 2026" — the year is the Sunday's, so a week spanning New Year reads correctly. */
export function weekLabel(monday: Date): string {
  const sunday = addDays(monday, 6)
  return `${formatShort(monday)} – ${formatShort(sunday)}, ${sunday.getFullYear()}`
}
