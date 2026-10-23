import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { usePlannerStore } from '@/stores/planner'
import {
  DIET_KEY,
  MAX_TARGET,
  MIN_TARGET,
  NEW_FOOD_TARGET,
  clamp,
  parseDietData,
  readKey,
  writeKey,
  type Food,
  type Log,
} from '@/lib/storage'
import * as tracker from '@/lib/tracker'

/** Foods eaten per day against a weekly goal. The visible week comes from the planner store. */
export const useDietStore = defineStore('diet', () => {
  const planner = usePlannerStore()
  const data = parseDietData(readKey(DIET_KEY))

  const foods = ref<Food[]>(data.foods)
  const log = ref<Log>(data.log)

  const week = computed(() => log.value[planner.weekKey] ?? {})

  function isEaten(id: string, day: number): boolean {
    return tracker.isDone(week.value, id, day)
  }

  function totalFor(id: string): number {
    return tracker.totalFor(week.value, id)
  }

  const dayCounts = computed(() => tracker.dayCounts(foods.value, week.value))
  const grandTotal = computed(() => tracker.grandTotal(foods.value, week.value))
  const goalsMet = computed(() => tracker.goalsMet(foods.value, week.value))

  function toggle(id: string, day: number): void {
    tracker.toggleDay(log.value, planner.weekKey, id, day)
  }

  function changeTarget(id: string, delta: number): void {
    const f = foods.value.find((x) => x.id === id)
    if (f) f.target = clamp(f.target + delta, MIN_TARGET, MAX_TARGET)
  }

  /** Returns false (and adds nothing) when the trimmed name is empty. */
  function addFood(rawName: string): boolean {
    const name = rawName.trim()
    if (!name) return false
    foods.value.push({ id: tracker.newId(), name, target: NEW_FOOD_TARGET })
    return true
  }

  /** Removes the food; its log history stays in storage, like exercises. */
  function removeFood(id: string): void {
    foods.value = foods.value.filter((f) => f.id !== id)
  }

  /** Adopt another tab's write; `key` is null when storage was cleared. */
  function syncFromStorage(key: string | null): void {
    if (key !== null && key !== DIET_KEY) return
    const fresh = parseDietData(readKey(DIET_KEY))
    foods.value = fresh.foods
    log.value = fresh.log
  }

  watch([foods, log], () => writeKey(DIET_KEY, { foods: foods.value, log: log.value }), {
    deep: true,
  })

  return {
    foods,
    log,
    dayCounts,
    grandTotal,
    goalsMet,
    isEaten,
    totalFor,
    toggle,
    changeTarget,
    addFood,
    removeFood,
    syncFromStorage,
  }
})
