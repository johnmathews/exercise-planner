import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { repsLabel, usePlannerStore } from '@/stores/planner'
import { DATA_KEY, SETTINGS_KEY } from '@/lib/storage'

// Friday 23 Oct 2026: the week is Mon 19 – Sun 25 and today is index 4.
const NOW = new Date(2026, 9, 23, 18, 0)

function stored(key: string): unknown {
  const raw = localStorage.getItem(key)
  return raw === null ? null : JSON.parse(raw)
}

describe('planner store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with the five default exercises and the current week', () => {
    const s = usePlannerStore()
    expect(s.exercises.map((e) => e.name)).toEqual([
      'Push-ups',
      'Pull-ups',
      'Squats',
      'Back extensions',
      'Kettlebell halos',
    ])
    expect(s.weekKey).toBe('2026-10-19')
    expect(s.label).toBe('Oct 19 – Oct 25, 2026')
    expect(s.days.map((d) => d.date)).toEqual(['19', '20', '21', '22', '23', '24', '25'])
    expect(s.days.findIndex((d) => d.isToday)).toBe(4)
  })

  it('loads saved prototype data from the shared key', () => {
    localStorage.setItem(
      DATA_KEY,
      JSON.stringify({
        exercises: [{ id: 'a', name: 'A', reps: 1, target: 2 }],
        log: { '2026-10-19': { a: [true, true, false, false, false, false, false] } },
      }),
    )
    setActivePinia(createPinia())
    const s = usePlannerStore()
    expect(s.exercises).toHaveLength(1)
    expect(s.totalFor('a')).toBe(2)
    expect(s.grandTotal).toBe(2)
  })

  it('toggles a cell on and off and persists the log', async () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    expect(s.isDone('pu', 0)).toBe(true)
    expect(s.totalFor('pu')).toBe(1)
    await nextTick()
    expect(stored(DATA_KEY)).toMatchObject({
      log: { '2026-10-19': { pu: [true, false, false, false, false, false, false] } },
    })
    s.toggle('pu', 0)
    expect(s.isDone('pu', 0)).toBe(false)
  })

  it('counts picks per day and the grand total across exercises', () => {
    const s = usePlannerStore()
    s.toggle('pu', 2)
    s.toggle('sq', 2)
    s.toggle('kh', 2)
    s.toggle('kh', 3)
    expect(s.dayCounts).toEqual([0, 0, 3, 1, 0, 0, 0])
    expect(s.grandTotal).toBe(4)
  })

  it('ignores log entries for removed exercises in the totals', () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    s.toggle('sq', 0)
    s.removeExercise('pu')
    expect(s.dayCounts[0]).toBe(1)
    expect(s.grandTotal).toBe(1)
    expect(s.log['2026-10-19']?.pu?.[0]).toBe(true)
  })

  it('keeps each week separate when navigating', () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    s.prevWeek()
    expect(s.weekKey).toBe('2026-10-12')
    expect(s.isDone('pu', 0)).toBe(false)
    expect(s.days.some((d) => d.isToday)).toBe(false)
    s.nextWeek()
    s.nextWeek()
    expect(s.weekKey).toBe('2026-10-26')
    s.thisWeek()
    expect(s.weekKey).toBe('2026-10-19')
    expect(s.isDone('pu', 0)).toBe(true)
  })

  it('clamps the goal to 0–7', () => {
    const s = usePlannerStore()
    for (let i = 0; i < 10; i++) s.changeTarget('pu', 1)
    expect(s.exercises[0]!.target).toBe(7)
    for (let i = 0; i < 10; i++) s.changeTarget('pu', -1)
    expect(s.exercises[0]!.target).toBe(0)
    s.changeTarget('missing', 1)
  })

  it('adds an exercise with goal 3 and ignores an empty name', async () => {
    const s = usePlannerStore()
    expect(s.addExercise({ name: '   ', reps: 5, perSide: false })).toBe(false)
    expect(s.exercises).toHaveLength(5)
    expect(s.addExercise({ name: '  Lunges ', reps: 12, perSide: true })).toBe(true)
    const added = s.exercises[5]!
    expect(added).toMatchObject({ name: 'Lunges', reps: 12, perSide: true, target: 3 })
    expect(added.id).toMatch(/^x/)
    await nextTick()
    expect((stored(DATA_KEY) as { exercises: unknown[] }).exercises).toHaveLength(6)
  })

  it('stores non-positive or non-numeric reps as 0', () => {
    const s = usePlannerStore()
    s.addExercise({ name: 'A', reps: Number.NaN, perSide: false })
    s.addExercise({ name: 'B', reps: -3, perSide: false })
    expect(s.exercises.slice(-2).map((e) => e.reps)).toEqual([0, 0])
  })

  it('moves "today" when the clock passes midnight and refreshNow runs', () => {
    const s = usePlannerStore()
    vi.setSystemTime(new Date(2026, 9, 24, 0, 5))
    s.refreshNow()
    expect(s.days.findIndex((d) => d.isToday)).toBe(5)
  })

  it('leaves now untouched when refreshNow runs on the same date', () => {
    const s = usePlannerStore()
    const before = s.now
    vi.setSystemTime(new Date(2026, 9, 23, 23, 59))
    s.refreshNow()
    expect(s.now).toBe(before)
  })

  it('syncFromStorage adopts another tab’s data and settings', () => {
    const s = usePlannerStore()
    localStorage.setItem(DATA_KEY, JSON.stringify({ exercises: [], log: {} }))
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accent: '#ff9f0a', dailyPick: 5 }))
    s.syncFromStorage(SETTINGS_KEY)
    expect(s.accent).toBe('#ff9f0a')
    expect(s.exercises).toHaveLength(5)
    s.syncFromStorage(DATA_KEY)
    expect(s.exercises).toEqual([])
  })

  it('syncFromStorage(null) resets to defaults after storage is cleared elsewhere', () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    s.setAccent('#bf5af2')
    localStorage.clear()
    s.syncFromStorage(null)
    expect(s.grandTotal).toBe(0)
    expect(s.accent).toBe('#30d158')
  })

  it('persists settings separately and clamps daily pick to 1–8', async () => {
    const s = usePlannerStore()
    expect(s.accent).toBe('#30d158')
    expect(s.dailyPick).toBe(3)
    s.setAccent('#bf5af2')
    for (let i = 0; i < 10; i++) s.changeDailyPick(1)
    expect(s.dailyPick).toBe(8)
    for (let i = 0; i < 10; i++) s.changeDailyPick(-1)
    expect(s.dailyPick).toBe(1)
    await nextTick()
    expect(stored(SETTINGS_KEY)).toEqual({ accent: '#bf5af2', dailyPick: 1 })
    expect(stored(DATA_KEY)).toBeNull()
  })
})

describe('repsLabel', () => {
  it('formats per set, per side and missing reps', () => {
    expect(repsLabel({ id: 'a', name: 'A', reps: 10, target: 3 })).toBe('10 reps / set')
    expect(repsLabel({ id: 'a', name: 'A', reps: 8, perSide: true, target: 3 })).toBe(
      '8 each side / set',
    )
    expect(repsLabel({ id: 'a', name: 'A', reps: 0, target: 3 })).toBe('—')
  })
})
