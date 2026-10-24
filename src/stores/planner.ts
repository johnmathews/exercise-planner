import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  DAY_NAMES,
  addDays,
  dateKey,
  formatShort,
  mondayOf,
  weekDates,
  weekLabel,
} from '@/lib/dates'
import {
  DATA_KEY,
  LEGACY_DATA_KEY,
  MAX_DAILY_PICK,
  MAX_SETS,
  MAX_TARGET,
  MIN_DAILY_PICK,
  MIN_TARGET,
  NEW_EXERCISE_TARGET,
  SETTINGS_KEY,
  clamp,
  defaultExercises,
  normaliseWeight,
  parsePlannerData,
  parseSettings,
  readKey,
  writeKey,
  type Exercise,
  type Log,
  type PlannerData,
  type PortableSettings,
} from '@/lib/storage'
import * as tracker from '@/lib/tracker'
import { mergeSettings, mergeTracked } from '@/lib/transfer'
import type { Theme } from '@/lib/theme'
import { copyPlan, planSource, type Plans } from '@/lib/plans'

export type Day = { name: string; date: string; key: string; isToday: boolean }

export type NewExercise = {
  name: string
  sets?: number
  reps: number
  perSide: boolean
  weight?: number
}

/**
 * The chips under an exercise name: "3 × 10 reps" or "3 × 8 each side" ("10 reps / set" and
 * "8 each side / set" without a set count, "3 sets" without reps), then "12 kg" when weighted;
 * "—" when it has none of these.
 */
export function exerciseDetails(e: Exercise): string[] {
  const chips: string[] = []
  const count = e.perSide ? `${e.reps} each side` : `${e.reps} reps`
  if (e.reps) chips.push(e.sets ? `${e.sets} × ${count}` : `${count} / set`)
  else if (e.sets) chips.push(`${e.sets} sets`)
  if (e.weight) chips.push(`${e.weight} kg`)
  return chips.length ? chips : ['—']
}

/** Cleans form input into the stored fields; null when the trimmed name is empty. */
function exerciseFields(input: NewExercise): Omit<Exercise, 'id' | 'target'> | null {
  const name = input.name.trim()
  if (!name) return null
  const reps = Number.isFinite(input.reps) && input.reps > 0 ? Math.floor(input.reps) : 0
  const sets = Math.min(MAX_SETS, Math.floor(input.sets ?? 0))
  const weight = normaliseWeight(input.weight)
  return {
    name,
    ...(sets > 0 ? { sets } : {}),
    reps,
    perSide: input.perSide,
    ...(weight !== undefined ? { weight } : {}),
  }
}

export const usePlannerStore = defineStore('planner', () => {
  /** "Now" as a ref so the today column moves when the tab is revisited after midnight. */
  const now = ref(new Date())
  /** Monday of the real current week, whichever week is on screen. */
  const currentWeekKey = computed(() => dateKey(mondayOf(now.value, 0)))
  const loadData = () =>
    parsePlannerData(readKey(DATA_KEY), readKey(LEGACY_DATA_KEY), currentWeekKey.value)
  const data = loadData()
  const settings = parseSettings(readKey(SETTINGS_KEY))

  const plans = ref<Plans<Exercise>>(data.plans)
  const log = ref<Log>(data.log)
  const weekOffset = ref(0)
  const accent = ref(settings.accent)
  const dailyPick = ref(settings.dailyPick)
  const theme = ref<Theme>(settings.theme)
  /** Config mode shows the plan-editing controls; normal mode only ticks cells. Not persisted. */
  const configMode = ref(false)

  const monday = computed(() => mondayOf(now.value, weekOffset.value))
  const weekKey = computed(() => dateKey(monday.value))
  const label = computed(() => weekLabel(monday.value))
  const nextWeekKey = computed(() => dateKey(addDays(monday.value, 7)))
  const week = computed(() => log.value[weekKey.value] ?? {})

  /** The week whose plan is showing; null while only the defaults exist. */
  const planWeek = computed(() => planSource(plans.value, weekKey.value))
  /** This week's exercises: its own plan, or the one it carries forward (see `planSource`). */
  const exercises = computed<Exercise[]>(() =>
    planWeek.value ? plans.value[planWeek.value]! : defaultExercises(),
  )
  /** The week this one's plan is carried over from, or null when it has its own. */
  const carriedFrom = computed(() => (planWeek.value === weekKey.value ? null : planWeek.value))

  /** The visible week's own plan, copied from what it shows on its first change. */
  function own(): Exercise[] {
    return (plans.value[weekKey.value] ??= copyPlan(exercises.value))
  }

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

  // Any change to a week, ticks included, gives it its own plan, so later edits to the week it was
  // carried from no longer move it.
  function toggle(id: string, day: number): void {
    own()
    tracker.toggleDay(log.value, weekKey.value, id, day)
  }

  function changeTarget(id: string, delta: number): void {
    const e = own().find((x) => x.id === id)
    if (e) e.target = clamp(e.target + delta, MIN_TARGET, MAX_TARGET)
  }

  /** Returns false (and adds nothing) when the trimmed name is empty. */
  function addExercise(input: NewExercise): boolean {
    const fields = exerciseFields(input)
    if (!fields) return false
    own().push({ id: tracker.newId(), ...fields, target: NEW_EXERCISE_TARGET })
    return true
  }

  /** Replaces name, sets, reps, per-side and weight this week, keeping the id, goal and history. */
  function updateExercise(id: string, input: NewExercise): boolean {
    const fields = exerciseFields(input)
    if (!fields || !exercises.value.some((e) => e.id === id)) return false
    const list = own()
    const i = list.findIndex((e) => e.id === id)
    list[i] = { id, ...fields, target: list[i]!.target }
    return true
  }

  /** Removes the exercise from this week; its log history stays in storage. */
  function removeExercise(id: string): void {
    plans.value[weekKey.value] = own().filter((e) => e.id !== id)
  }

  /** Whether the next week already has a plan of its own, which a copy would replace. */
  const nextWeekHasPlan = computed(() => nextWeekKey.value in plans.value)

  /** Gives the next week a copy of this week's exercises, replacing any plan it had. */
  function copyToNextWeek(): void {
    plans.value[nextWeekKey.value] = copyPlan(exercises.value)
  }

  function setConfigMode(on: boolean): void {
    configMode.value = on
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
      const fresh = loadData()
      plans.value = fresh.plans
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

  /** The accent and daily pick, or null while this browser has saved no settings at all. */
  function savedSettings(): PortableSettings | null {
    return readKey(SETTINGS_KEY) === null
      ? null
      : { accent: accent.value, dailyPick: dailyPick.value }
  }

  /** Merges an export in without deleting anything (`mergeTracked`, `mergeSettings`). */
  function importData(exercise: PlannerData, incoming: PortableSettings | null): void {
    const merged = mergeTracked({ plans: plans.value, log: log.value }, exercise)
    plans.value = merged.plans
    log.value = merged.log
    const next = mergeSettings(savedSettings(), incoming)
    if (next) {
      accent.value = next.accent
      dailyPick.value = next.dailyPick
    }
  }

  const save = () => writeKey(DATA_KEY, { plans: plans.value, log: log.value })
  watch([plans, log], save, { deep: true })
  // Save a migration from the legacy key straight away, so it runs only once.
  if (readKey(DATA_KEY) === null && readKey(LEGACY_DATA_KEY) !== null) save()
  watch([accent, dailyPick, theme], () =>
    writeKey(SETTINGS_KEY, {
      accent: accent.value,
      dailyPick: dailyPick.value,
      theme: theme.value,
    }),
  )

  return {
    plans,
    exercises,
    carriedFrom,
    log,
    weekOffset,
    accent,
    dailyPick,
    theme,
    now,
    monday,
    weekKey,
    currentWeekKey,
    nextWeekKey,
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
    nextWeekHasPlan,
    copyToNextWeek,
    configMode,
    setConfigMode,
    prevWeek,
    nextWeek,
    thisWeek,
    refreshNow,
    syncFromStorage,
    setAccent,
    changeDailyPick,
    setTheme,
    savedSettings,
    importData,
  }
})
