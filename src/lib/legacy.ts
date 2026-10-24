import {
  DATA_KEY,
  DIET_KEY,
  LEGACY_DATA_KEY,
  LEGACY_DIET_KEY,
  SETTINGS_KEY,
  isRecord,
  normalisePortableSettings,
  parseDietData,
  parseJson,
  parsePlannerData,
  readKey,
  writeKey,
} from '@/lib/storage'
import type { ExportData } from '@/lib/transfer'

/**
 * What this browser recorded before accounts existed, as export data, or null when it holds
 * nothing worth offering. The keys are read with the same parsing and migration the stores used
 * then (docs/architecture.md §4); they are never written or removed.
 */
export function readLegacyData(currentWeek: string): ExportData | null {
  const exercise = parsePlannerData(readKey(DATA_KEY), readKey(LEGACY_DATA_KEY), currentWeek)
  const diet = parseDietData(readKey(DIET_KEY), readKey(LEGACY_DIET_KEY), currentWeek)
  // The settings key also holds the theme, which every device still writes; only an accent or a
  // daily pick, saved before accounts, is the person's.
  const raw = parseJson(readKey(SETTINGS_KEY))
  const settings =
    isRecord(raw) && ('accent' in raw || 'dailyPick' in raw) ? normalisePortableSettings(raw) : null
  const empty = (t: { plans: object; log: object }) =>
    !Object.keys(t.plans).length && !Object.keys(t.log).length
  if (empty(exercise) && empty(diet) && !settings) return null
  return { exercise, diet, settings }
}

/**
 * Whether the first-login prompt has had its answer for a user on this browser: `imported`
 * (added, or nothing left to add) or `dismissed` ("Not mine"). Kept through sign-out, so the
 * answer holds for the next sign-in too.
 */
export const IMPORT_MARKER_PREFIX = 'exercise-planner-import-v1:'
export type ImportMarker = 'imported' | 'dismissed'

export function readImportMarker(user: string): ImportMarker | null {
  const value = readKey(IMPORT_MARKER_PREFIX + user)
  return value === '"imported"' || value === '"dismissed"'
    ? (JSON.parse(value) as ImportMarker)
    : null
}

export function writeImportMarker(user: string, marker: ImportMarker): void {
  writeKey(IMPORT_MARKER_PREFIX + user, marker)
}
