import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { usePlannerStore } from '@/stores/planner'
import {
  MAX_TARGET,
  MIN_TARGET,
  NEW_FOOD_TARGET,
  clamp,
  defaultFoods,
  type DietData,
  type Food,
  type Log,
} from '@/lib/storage'
import { mergeTracked } from '@/lib/transfer'
import { copyPlan, planSource, type Plans } from '@/lib/plans'
import * as tracker from '@/lib/tracker'

/**
 * Foods eaten per day against a weekly goal. The visible week comes from the planner store, and
 * food plans carry forward week to week the same way exercise plans do.
 */
export const useDietStore = defineStore('diet', () => {
  const planner = usePlannerStore()
  // Filled and saved by the sync store, like the planner's data.
  const plans = ref<Plans<Food>>({})
  const log = ref<Log>({})

  const week = computed(() => log.value[planner.weekKey] ?? {})
  const planWeek = computed(() => planSource(plans.value, planner.weekKey))
  const foods = computed<Food[]>(() =>
    planWeek.value ? plans.value[planWeek.value]! : defaultFoods(),
  )

  /** The week this one's foods come from, or null when it has its own food plan. */
  const carriedFrom = computed(() => (planWeek.value === planner.weekKey ? null : planWeek.value))

  /** The visible week's own plan, copied from what it shows on its first change. */
  function own(): Food[] {
    return (plans.value[planner.weekKey] ??= copyPlan(foods.value))
  }

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
    own()
    tracker.toggleDay(log.value, planner.weekKey, id, day)
  }

  function changeTarget(id: string, delta: number): void {
    const f = own().find((x) => x.id === id)
    if (f) f.target = clamp(f.target + delta, MIN_TARGET, MAX_TARGET)
  }

  /** Returns false (and adds nothing) when the trimmed name is empty. */
  function addFood(rawName: string): boolean {
    const name = rawName.trim()
    if (!name) return false
    own().push({ id: tracker.newId(), name, target: NEW_FOOD_TARGET })
    return true
  }

  /** Removes the food from this week; its log history stays in storage, like exercises. */
  function removeFood(id: string): void {
    plans.value[planner.weekKey] = own().filter((f) => f.id !== id)
  }

  const nextWeekHasPlan = computed(() => planner.nextWeekKey in plans.value)

  /** Gives the next week a copy of this week's foods, replacing any plan it had. */
  function copyToNextWeek(): void {
    plans.value[planner.nextWeekKey] = copyPlan(foods.value)
  }

  /** Replace the user's food data wholesale: from the cache, the server, or another tab. */
  function adopt(data: DietData): void {
    plans.value = data.plans
    log.value = data.log
  }

  /** Replace one week's food plan, e.g. with the server's copy after a conflict. */
  function adoptWeek(week: string, items: Food[]): void {
    plans.value[week] = items
  }

  function clear(): void {
    adopt({ plans: {}, log: {} })
  }

  /** Merges an export's food plans and log in without deleting anything (`mergeTracked`). */
  function importData(incoming: DietData): void {
    const merged = mergeTracked({ plans: plans.value, log: log.value }, incoming)
    plans.value = merged.plans
    log.value = merged.log
  }

  return {
    plans,
    foods,
    carriedFrom,
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
    nextWeekHasPlan,
    copyToNextWeek,
    adopt,
    adoptWeek,
    clear,
    importData,
  }
})
