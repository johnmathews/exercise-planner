import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { DAY_NAMES, dateKey, formatShort, mondayOf, weekDates, weekLabel } from '@/lib/dates'
import {
  DATA_KEY,
  MAX_DAILY_PICK,
  MAX_TARGET,
  MIN_DAILY_PICK,
  MIN_TARGET,
  NEW_EXERCISE_TARGET,
  SETTINGS_KEY,
  clamp,
  normaliseWeight,
  parsePlannerData,
  parseSettings,
  readKey,
  writeKey,
  type Exercise,
  type Log,
} from '@/lib/storage'
import * as tracker from '@/lib/tracker'
import type { Theme } from '@/lib/theme'

export type Day = { name: string; date: string; key: string; isToday: boolean }

export type NewExercise = { name: string; reps: number; perSide: boolean; weight?: number }

/** The chips under an exercise name, e.g. ["15 reps / set", "12 kg"]; "—" when it has neither. */
export function exerciseDetails(e: Exercise): string[] {
  const chips: string[] = []
  if (e.reps) chips.push(e.perSide ? `${e.reps} each side / set` : `${e.reps} reps / set`)
  if (e.weight) chips.push(`${e.weight} kg`)
  return chips.length ? chips : ['—']
}

/** Cleans form input into the stored fields; null when the trimmed name is empty. */
function exerciseFields(input: NewExercise): Omit<Exercise, 'id' | 'target'> | null {
  const name = input.name.trim()
  if (!name) return null
  const reps = Number.isFinite(input.reps) && input.reps > 0 ? Math.floor(input.reps) : 0
  const weight = normaliseWeight(input.weight)
  return { name, reps, perSide: input.perSide, ...(weight !== undefined ? { weight } : {}) }
}

export const usePlannerStore = defineStore('planner', () => {
  const data = parsePlannerData(readKey(DATA_KEY))
  const settings = parseSettings(readKey(SETTINGS_KEY))

  const exercises = ref<Exercise[]>(data.exercises)
  const log = ref<Log>(data.log)
  const weekOffset = ref(0)
  const accent = ref(settings.accent)
  const dailyPick = ref(settings.dailyPick)
  const theme = ref<Theme>(settings.theme)
  /** "Now" as a ref so the today column moves when the tab is revisited after midnight. */
  const now = ref(new Date())

  const monday = computed(() => mondayOf(now.value, weekOffset.value))
  const weekKey = computed(() => dateKey(monday.value))
  const label = computed(() => weekLabel(monday.value))
  const week = computed(() => log.value[weekKey.value] ?? {})

  const days = computed<Day[]>(() => {
    const todayKey = dateKey(now.value)
    return weekDates(monday.value).map((d, i) => ({
      name: DAY_NAMES[i]!,
      date: formatShort(d).replace(/^\w+ /, ''),
      key: dateKey(d),
      isToday: dateKey(d) === todayKey,
    }))
  })

  function isDone(id: string, day: number): boolean {
    return tracker.isDone(week.value, id, day)
  }

  function totalFor(id: string): number {
    return tracker.totalFor(week.value, id)
  }

  const dayCounts = computed(() => tracker.dayCounts(exercises.value, week.value))
  const grandTotal = computed(() => tracker.grandTotal(exercises.value, week.value))

  function toggle(id: string, day: number): void {
    tracker.toggleDay(log.value, weekKey.value, id, day)
  }

  function changeTarget(id: string, delta: number): void {
    const e = exercises.value.find((x) => x.id === id)
    if (e) e.target = clamp(e.target + delta, MIN_TARGET, MAX_TARGET)
  }

  /** Returns false (and adds nothing) when the trimmed name is empty. */
  function addExercise(input: NewExercise): boolean {
    const fields = exerciseFields(input)
    if (!fields) return false
    exercises.value.push({ id: tracker.newId(), ...fields, target: NEW_EXERCISE_TARGET })
    return true
  }

  /** Replaces name, reps, per-side and weight, keeping the id, goal and history. */
  function updateExercise(id: string, input: NewExercise): boolean {
    const fields = exerciseFields(input)
    const i = exercises.value.findIndex((e) => e.id === id)
    if (!fields || i === -1) return false
    const { target } = exercises.value[i]!
    exercises.value[i] = { id, ...fields, target }
    return true
  }

  /** Removes the exercise; its log history stays in storage, as the handoff allows. */
  function removeExercise(id: string): void {
    exercises.value = exercises.value.filter((e) => e.id !== id)
  }

  function prevWeek(): void {
    weekOffset.value -= 1
  }
  function nextWeek(): void {
    weekOffset.value += 1
  }
  function thisWeek(): void {
    weekOffset.value = 0
  }
  /** Moves "today" only when the calendar date has changed, so periodic calls are free. */
  function refreshNow(): void {
    const next = new Date()
    if (dateKey(next) !== dateKey(now.value)) now.value = next
  }

  /**
   * Adopt a change another tab wrote (from a `storage` event). Without this a stale tab writes its
   * whole in-memory state back and erases the other tab's edits. `key` is null when storage is cleared.
   */
  function syncFromStorage(key: string | null): void {
    if (key === null || key === DATA_KEY) {
      const fresh = parsePlannerData(readKey(DATA_KEY))
      exercises.value = fresh.exercises
      log.value = fresh.log
    }
    if (key === null || key === SETTINGS_KEY) {
      const fresh = parseSettings(readKey(SETTINGS_KEY))
      accent.value = fresh.accent
      dailyPick.value = fresh.dailyPick
      theme.value = fresh.theme
    }
  }

  function setAccent(color: string): void {
    accent.value = color
  }
  function changeDailyPick(delta: number): void {
    dailyPick.value = clamp(dailyPick.value + delta, MIN_DAILY_PICK, MAX_DAILY_PICK)
  }
  function setTheme(next: Theme): void {
    theme.value = next
  }

  watch(
    [exercises, log],
    () => writeKey(DATA_KEY, { exercises: exercises.value, log: log.value }),
    {
      deep: true,
    },
  )
  watch([accent, dailyPick, theme], () =>
    writeKey(SETTINGS_KEY, {
      accent: accent.value,
      dailyPick: dailyPick.value,
      theme: theme.value,
    }),
  )

  return {
    exercises,
    log,
    weekOffset,
    accent,
    dailyPick,
    theme,
    now,
    monday,
    weekKey,
    label,
    days,
    dayCounts,
    grandTotal,
    isDone,
    totalFor,
    toggle,
    changeTarget,
    addExercise,
    updateExercise,
    removeExercise,
    prevWeek,
    nextWeek,
    thisWeek,
    refreshNow,
    syncFromStorage,
    setAccent,
    changeDailyPick,
    setTheme,
  }
})
