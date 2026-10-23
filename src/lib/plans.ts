/** Week Monday `YYYY-MM-DD` → that week's items. A week without an entry follows another week's. */
export type Plans<T> = Record<string, T[]>

/**
 * The week whose plan `week` shows: its own; else the latest earlier planned week (carry forward);
 * else, for weeks before the first plan, the earliest one. Null when nothing is planned yet.
 */
export function planSource(plans: Plans<unknown>, week: string): string | null {
  // `in`, not Object.hasOwn: Vue tracks `in` on a reactive object, so callers' computeds update.
  if (week in plans) return week
  // `YYYY-MM-DD` keys sort chronologically as strings.
  const keys = Object.keys(plans).sort()
  return keys.filter((k) => k < week).at(-1) ?? keys[0] ?? null
}

/** A copy whose items can be edited without touching the week it came from. */
export function copyPlan<T extends object>(items: T[]): T[] {
  return items.map((it) => ({ ...it }))
}
