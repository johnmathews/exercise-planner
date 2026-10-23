export type Exercise = {
  id: string
  name: string
  reps: number
  perSide?: boolean
  /** Weekly goal in days, 0–7. */
  target: number
}

/** Week Monday `YYYY-MM-DD` → exercise id → done flags Mon–Sun. */
export type Log = Record<string, Record<string, boolean[]>>

export type PlannerData = { exercises: Exercise[]; log: Log }

export type Settings = { accent: string; dailyPick: number }

/** Same key and shape as the design prototype, so its saved data carries over on the same origin. */
export const DATA_KEY = 'exercise-planner-v1'
export const SETTINGS_KEY = 'exercise-planner-settings-v1'

export const ACCENTS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2'] as const
export const MIN_TARGET = 0
export const MAX_TARGET = 7
export const MIN_DAILY_PICK = 1
export const MAX_DAILY_PICK = 8
export const NEW_EXERCISE_TARGET = 3

export const DEFAULT_SETTINGS: Settings = { accent: '#30d158', dailyPick: 3 }

export function defaultExercises(): Exercise[] {
  return [
    { id: 'pu', name: 'Push-ups', reps: 10, target: 4 },
    { id: 'pl', name: 'Pull-ups', reps: 3, target: 4 },
    { id: 'sq', name: 'Squats', reps: 15, target: 4 },
    { id: 'be', name: 'Back extensions', reps: 12, target: 3 },
    { id: 'kh', name: 'Kettlebell halos', reps: 8, perSide: true, target: 3 },
  ]
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function toInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback
}

function normaliseExercise(v: unknown): Exercise | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null
  // Key order and an explicit `perSide: false` both follow the prototype, so its saved data
  // re-serialises byte for byte and loading it never triggers a rewrite.
  return {
    id: v.id,
    name: v.name,
    reps: Math.max(0, toInt(v.reps, 0)),
    ...(typeof v.perSide === 'boolean' ? { perSide: v.perSide } : {}),
    target: clamp(toInt(v.target, NEW_EXERCISE_TARGET), MIN_TARGET, MAX_TARGET),
  }
}

function normaliseLog(v: unknown): Log {
  const log: Log = {}
  if (!isRecord(v)) return log
  for (const [week, entries] of Object.entries(v)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !isRecord(entries)) continue
    const out: Record<string, boolean[]> = {}
    for (const [id, days] of Object.entries(entries)) {
      if (!Array.isArray(days)) continue
      out[id] = Array.from({ length: 7 }, (_, i) => days[i] === true)
    }
    log[week] = out
  }
  return log
}

/**
 * Coerce whatever is stored into a valid `PlannerData`. Each field falls back on its own, so a
 * payload with a bad `log` keeps its exercises and vice versa. The prototype trusted the stored
 * shape and crashed on a payload missing `log`.
 */
export function parsePlannerData(raw: string | null): PlannerData {
  let parsed: unknown = null
  try {
    parsed = raw === null ? null : JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!isRecord(parsed)) return { exercises: defaultExercises(), log: {} }
  const exercises = Array.isArray(parsed.exercises)
    ? parsed.exercises.map(normaliseExercise).filter((e): e is Exercise => e !== null)
    : defaultExercises()
  return { exercises, log: normaliseLog(parsed.log) }
}

export function parseSettings(raw: string | null): Settings {
  let parsed: unknown = null
  try {
    parsed = raw === null ? null : JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!isRecord(parsed)) return { ...DEFAULT_SETTINGS }
  const accent =
    typeof parsed.accent === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.accent)
      ? parsed.accent
      : DEFAULT_SETTINGS.accent
  const dailyPick = clamp(
    toInt(parsed.dailyPick, DEFAULT_SETTINGS.dailyPick),
    MIN_DAILY_PICK,
    MAX_DAILY_PICK,
  )
  return { accent, dailyPick }
}

/** `localStorage` can throw (private mode, blocked site data); the app must still run. */
export function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Skips unchanged values, so adopting another tab's write never echoes back to it. */
export function writeKey(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value)
    if (localStorage.getItem(key) !== json) localStorage.setItem(key, json)
  } catch {
    // Storage unavailable or full: keep running with in-memory state.
  }
}
