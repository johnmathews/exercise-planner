import { DAY_NAMES } from '@/lib/dates'
import type { Log } from '@/lib/storage'

/** Anything tracked as a tick per day against a weekly goal: exercises and foods. */
export type Tracked = { id: string; name: string; target: number }

/** Footer colour for a per-day count: accent, warning, muted, or neutral. */
export type CountTone = 'met' | 'over' | 'under' | 'plain'

/** One week of a log: item id → done flags Mon–Sun. */
export type WeekLog = Record<string, boolean[]>

export function isDone(week: WeekLog, id: string, day: number): boolean {
  return week[id]?.[day] === true
}

export function totalFor(week: WeekLog, id: string): number {
  return (week[id] ?? []).filter(Boolean).length
}

/** How many of `items` are ticked on each day. Log entries for removed items don't count. */
export function dayCounts(items: Tracked[], week: WeekLog): number[] {
  return DAY_NAMES.map((_, i) => items.filter((it) => isDone(week, it.id, i)).length)
}

export function grandTotal(items: Tracked[], week: WeekLog): number {
  return items.reduce((sum, it) => sum + totalFor(week, it.id), 0)
}

export function goalMet(total: number, target: number): boolean {
  return target > 0 && total >= target
}

export function goalsMet(items: Tracked[], week: WeekLog): number {
  return items.filter((it) => goalMet(totalFor(week, it.id), it.target)).length
}

/** Flip one day in place, creating the week and the item's flags on first use. */
export function toggleDay(log: Log, weekKey: string, id: string, day: number): void {
  // Read each level back through `log` rather than keeping the `??=` result: on a reactive log
  // that result is the raw object, and a change made to it would notify no watcher.
  log[weekKey] ??= {}
  const week = log[weekKey]!
  week[id] ??= Array<boolean>(7).fill(false)
  const flags = week[id]!
  flags[day] = !flags[day]
}

export function newId(): string {
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
