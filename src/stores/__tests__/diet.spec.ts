import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useDietStore } from '@/stores/diet'
import { usePlannerStore } from '@/stores/planner'
import { DATA_KEY, DIET_KEY } from '@/lib/storage'

// Friday 23 Oct 2026: the visible week is Mon 19 – Sun 25.
const NOW = new Date(2026, 9, 23, 18, 0)

function stored(key: string): unknown {
  const raw = localStorage.getItem(key)
  return raw === null ? null : JSON.parse(raw)
}

describe('diet store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with the default foods', () => {
    const d = useDietStore()
    expect(d.foods.map((f) => [f.name, f.target])).toEqual([
      ['Vegetables', 7],
      ['Fruit', 5],
      ['Fish', 2],
      ['Nuts', 3],
    ])
    expect(d.grandTotal).toBe(0)
    expect(d.goalsMet).toBe(0)
  })

  it('toggles foods in the planner’s visible week and persists only the diet key', async () => {
    const d = useDietStore()
    d.toggle('fish', 0)
    d.toggle('fish', 3)
    d.toggle('veg', 3)
    expect(d.isEaten('fish', 3)).toBe(true)
    expect(d.totalFor('fish')).toBe(2)
    expect(d.dayCounts).toEqual([1, 0, 0, 2, 0, 0, 0])
    expect(d.grandTotal).toBe(3)
    expect(d.goalsMet).toBe(1)
    await nextTick()
    expect(stored(DIET_KEY)).toMatchObject({
      log: { '2026-10-19': { fish: [true, false, false, true, false, false, false] } },
    })
    expect(stored(DATA_KEY)).toBeNull()
  })

  it('follows week navigation from the planner store', () => {
    const d = useDietStore()
    const p = usePlannerStore()
    d.toggle('fruit', 1)
    p.prevWeek()
    expect(d.isEaten('fruit', 1)).toBe(false)
    d.toggle('fruit', 1)
    expect(Object.keys(d.log).sort()).toEqual(['2026-10-12', '2026-10-19'])
    p.thisWeek()
    expect(d.totalFor('fruit')).toBe(1)
  })

  it('clamps food goals to 0–7', () => {
    const d = useDietStore()
    d.changeTarget('veg', 1)
    expect(d.foods[0]!.target).toBe(7)
    for (let i = 0; i < 9; i++) d.changeTarget('veg', -1)
    expect(d.foods[0]!.target).toBe(0)
    d.changeTarget('missing', 1)
  })

  it('adds a food with goal 3, ignores an empty name, and removes', () => {
    const d = useDietStore()
    expect(d.addFood('  ')).toBe(false)
    expect(d.addFood(' Beans ')).toBe(true)
    expect(d.foods.at(-1)).toMatchObject({ name: 'Beans', target: 3 })
    d.toggle('nuts', 0)
    d.removeFood('nuts')
    expect(d.foods.map((f) => f.id)).not.toContain('nuts')
    expect(d.grandTotal).toBe(0)
    expect(d.log['2026-10-19']?.nuts?.[0]).toBe(true)
  })

  it('adopts another tab’s diet write and ignores unrelated keys', () => {
    const d = useDietStore()
    localStorage.setItem(
      DIET_KEY,
      JSON.stringify({ plans: { '2026-10-19': [{ id: 'z', name: 'Z', target: 1 }] } }),
    )
    d.syncFromStorage(DATA_KEY)
    expect(d.foods).toHaveLength(4)
    d.syncFromStorage(DIET_KEY)
    expect(d.foods.map((f) => f.name)).toEqual(['Z'])
    localStorage.clear()
    d.syncFromStorage(null)
    expect(d.foods).toHaveLength(4)
  })

  it('carries food plans forward and copies them to the next week', () => {
    const d = useDietStore()
    const p = usePlannerStore()
    d.addFood('Beans')
    p.nextWeek()
    expect(d.foods.map((f) => f.name)).toContain('Beans')
    d.removeFood('fish')
    p.prevWeek()
    expect(d.nextWeekHasPlan).toBe(true)
    expect(d.foods.map((f) => f.id)).toContain('fish')
    d.copyToNextWeek()
    p.nextWeek()
    expect(d.foods.map((f) => f.id)).toContain('fish')
  })

  it('migrates the legacy diet key', () => {
    localStorage.setItem(
      'exercise-planner-diet-v1',
      JSON.stringify({ foods: [{ id: 'z', name: 'Z', target: 2 }], log: {} }),
    )
    setActivePinia(createPinia())
    const d = useDietStore()
    expect(d.foods.map((f) => f.name)).toEqual(['Z'])
    expect(stored(DIET_KEY)).toMatchObject({ plans: { '2026-10-19': [{ id: 'z' }] } })
  })
})

describe('diet importData', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('merges food plans and ticks under the diet key only', async () => {
    const d = useDietStore()
    d.importData({
      plans: { '2026-10-19': [{ id: 'eggs', name: 'Eggs', target: 2 }] },
      log: { '2026-10-19': { eggs: [true, false, false, false, false, false, false] } },
    })
    await nextTick()
    expect(d.foods.map((f) => f.name)).toEqual(['Eggs'])
    expect(d.isEaten('eggs', 0)).toBe(true)
    expect(stored(DIET_KEY)).toEqual({
      plans: { '2026-10-19': [{ id: 'eggs', name: 'Eggs', target: 2 }] },
      log: { '2026-10-19': { eggs: [true, false, false, false, false, false, false] } },
    })
    expect(stored(DATA_KEY)).toBeNull()
  })
})
