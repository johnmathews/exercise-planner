import { isTheme, type Theme } from '@/lib/theme'
import type { Plans } from '@/lib/plans'

export type Exercise = {
  id: string
  name: string
  /** Sets per session; absent when not set. */
  sets?: number
  reps: number
  perSide?: boolean
  /** Load in kg (e.g. a 12 kg kettlebell); absent for bodyweight exercises. */
  weight?: number
  /** Weekly goal in days, 0–7. */
  target: number
}

export type Food = {
  id: string
  name: string
  /** Weekly goal in days, 0–7. */
  target: number
}

/** Week Monday `YYYY-MM-DD` → item id → done flags Mon–Sun. */
export type Log = Record<string, Record<string, boolean[]>>

export type PlannerData = { plans: Plans<Exercise>; log: Log }

export type DietData = { plans: Plans<Food>; log: Log }

export type Settings = { accent: string; dailyPick: number; theme: Theme }

/** Exercise plans per week plus the log: `{ plans, log }`. */
export const DATA_KEY = 'exercise-planner-v2'
/** Food plans per week plus the diet log. */
export const DIET_KEY = 'exercise-planner-diet-v2'
export const SETTINGS_KEY = 'exercise-planner-settings-v1'
/**
 * The earlier single-list format (`{ exercises, log }` and `{ foods, log }`; the exercise one is the
 * design prototype's). Read to migrate when v2 data is missing or unreadable; never written or
 * deleted.
 */
export const LEGACY_DATA_KEY = 'exercise-planner-v1'
export const LEGACY_DIET_KEY = 'exercise-planner-diet-v1'

export const ACCENTS = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2'] as const
export const MIN_TARGET = 0
export const MAX_TARGET = 7
export const MIN_DAILY_PICK = 1
export const MAX_DAILY_PICK = 8
export const NEW_EXERCISE_TARGET = 3
export const MAX_WEIGHT = 500
export const MAX_SETS = 20
export const NEW_FOOD_TARGET = 3

export const DEFAULT_SETTINGS: Settings = { accent: '#30d158', dailyPick: 3, theme: 'system' }

export function defaultExercises(): Exercise[] {
  return [
    { id: 'pu', name: 'Push-ups', reps: 10, target: 4 },
    { id: 'pl', name: 'Pull-ups', reps: 3, target: 4 },
    { id: 'sq', name: 'Squats', reps: 15, target: 4 },
    { id: 'be', name: 'Back extensions', reps: 12, target: 3 },
    { id: 'kh', name: 'Kettlebell halos', reps: 8, perSide: true, target: 3 },
  ]
}

export function defaultFoods(): Food[] {
  return [
    { id: 'veg', name: 'Vegetables', target: 7 },
    { id: 'fruit', name: 'Fruit', target: 5 },
    { id: 'fish', name: 'Fish', target: 2 },
    { id: 'nuts', name: 'Nuts', target: 3 },
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

function parseJson(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** A usable weight in kg, rounded to 2 decimals and capped; `undefined` means "no weight". */
export function normaliseWeight(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  // Round before the sign check, so a tiny value like 0.004 can't come out as 0.
  const kg = Math.round(v * 100) / 100
  return kg > 0 ? Math.min(MAX_WEIGHT, kg) : undefined
}

function normaliseExercise(v: unknown): Exercise | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null
  const weight = normaliseWeight(v.weight)
  const sets = toInt(v.sets, 0)
  return {
    id: v.id,
    name: v.name,
    ...(sets > 0 ? { sets: Math.min(MAX_SETS, sets) } : {}),
    reps: Math.max(0, toInt(v.reps, 0)),
    ...(typeof v.perSide === 'boolean' ? { perSide: v.perSide } : {}),
    ...(weight !== undefined ? { weight } : {}),
    target: clamp(toInt(v.target, NEW_EXERCISE_TARGET), MIN_TARGET, MAX_TARGET),
  }
}

function normaliseFood(v: unknown): Food | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string') return null
  return {
    id: v.id,
    name: v.name,
    target: clamp(toInt(v.target, NEW_FOOD_TARGET), MIN_TARGET, MAX_TARGET),
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

function normalisePlans<T>(v: unknown, normalise: (item: unknown) => T | null): Plans<T> {
  const plans: Plans<T> = {}
  if (!isRecord(v)) return plans
  for (const [week, items] of Object.entries(v)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Array.isArray(items)) continue
    plans[week] = items.map(normalise).filter((it): it is T => it !== null)
  }
  return plans
}

type TrackedData<T> = { plans: Plans<T>; log: Log }

/**
 * Coerce stored data into `{ plans, log }`, each field falling back on its own. Without v2 data, a
 * legacy single-list payload migrates: its list becomes the plan for every week it logged and for
 * `currentWeek`, so every week looks as it did before. With neither, plans start empty and the
 * stores show the defaults until something is changed.
 */
function parseTracked<T>(
  raw: string | null,
  legacyRaw: string | null,
  currentWeek: string,
  legacyListKey: 'exercises' | 'foods',
  normalise: (item: unknown) => T | null,
  defaults: () => T[],
): TrackedData<T> {
  const parsed = parseJson(raw)
  if (isRecord(parsed)) {
    return { plans: normalisePlans(parsed.plans, normalise), log: normaliseLog(parsed.log) }
  }
  if (legacyRaw === null) return { plans: {}, log: {} }
  const legacy = parseJson(legacyRaw)
  const list =
    isRecord(legacy) && Array.isArray(legacy[legacyListKey])
      ? (legacy[legacyListKey] as unknown[]).map(normalise).filter((it): it is T => it !== null)
      : defaults()
  const log = normaliseLog(isRecord(legacy) ? legacy.log : undefined)
  const plans: Plans<T> = {}
  for (const week of new Set([...Object.keys(log), currentWeek])) {
    plans[week] = list.map((it) => ({ ...it }))
  }
  return { plans, log }
}

export function parsePlannerData(
  raw: string | null,
  legacyRaw: string | null,
  currentWeek: string,
): PlannerData {
  return parseTracked(raw, legacyRaw, currentWeek, 'exercises', normaliseExercise, defaultExercises)
}

export function parseDietData(
  raw: string | null,
  legacyRaw: string | null,
  currentWeek: string,
): DietData {
  return parseTracked(raw, legacyRaw, currentWeek, 'foods', normaliseFood, defaultFoods)
}

export function parseSettings(raw: string | null): Settings {
  const parsed = parseJson(raw)
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
  const theme = isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme
  return { accent, dailyPick, theme }
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
