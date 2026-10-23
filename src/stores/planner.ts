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
  parsePlannerData,
  parseSettings,
  readKey,
  writeKey,
  type Exercise,
  type Log,
} from '@/lib/storage'

export type Day = { name: string; date: string; key: string; isToday: boolean }

export type NewExercise = { name: string; reps: number; perSide: boolean }

function newId(): string {
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function repsLabel(e: Exercise): string {
  if (!e.reps) return '—'
  return e.perSide ? `${e.reps} each side / set` : `${e.reps} reps / set`
}

export const usePlannerStore = defineStore('planner', () => {
  const data = parsePlannerData(readKey(DATA_KEY))
  const settings = parseSettings(readKey(SETTINGS_KEY))

  const exercises = ref<Exercise[]>(data.exercises)
  const log = ref<Log>(data.log)
  const weekOffset = ref(0)
  const accent = ref(settings.accent)
  const dailyPick = ref(settings.dailyPick)
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
    return week.value[id]?.[day] === true
  }

  function totalFor(id: string): number {
    return (week.value[id] ?? []).filter(Boolean).length
  }

  const dayCounts = computed(() =>
    DAY_NAMES.map((_, i) => exercises.value.filter((e) => isDone(e.id, i)).length),
  )

  const grandTotal = computed(() => exercises.value.reduce((sum, e) => sum + totalFor(e.id), 0))

  function toggle(id: string, day: number): void {
    const w = (log.value[weekKey.value] ??= {})
    const flags = (w[id] ??= Array<boolean>(7).fill(false))
    flags[day] = !flags[day]
  }

  function changeTarget(id: string, delta: number): void {
    const e = exercises.value.find((x) => x.id === id)
    if (e) e.target = clamp(e.target + delta, MIN_TARGET, MAX_TARGET)
  }

  /** Returns false (and adds nothing) when the trimmed name is empty. */
  function addExercise(input: NewExercise): boolean {
    const name = input.name.trim()
    if (!name) return false
    const reps = Number.isFinite(input.reps) && input.reps > 0 ? Math.floor(input.reps) : 0
    exercises.value.push({
      id: newId(),
      name,
      reps,
      perSide: input.perSide,
      target: NEW_EXERCISE_TARGET,
    })
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
  function refreshNow(): void {
    now.value = new Date()
  }

  function setAccent(color: string): void {
    accent.value = color
  }
  function changeDailyPick(delta: number): void {
    dailyPick.value = clamp(dailyPick.value + delta, MIN_DAILY_PICK, MAX_DAILY_PICK)
  }

  watch(
    [exercises, log],
    () => writeKey(DATA_KEY, { exercises: exercises.value, log: log.value }),
    {
      deep: true,
    },
  )
  watch([accent, dailyPick], () =>
    writeKey(SETTINGS_KEY, { accent: accent.value, dailyPick: dailyPick.value }),
  )

  return {
    exercises,
    log,
    weekOffset,
    accent,
    dailyPick,
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
    removeExercise,
    prevWeek,
    nextWeek,
    thisWeek,
    refreshNow,
    setAccent,
    changeDailyPick,
  }
})
