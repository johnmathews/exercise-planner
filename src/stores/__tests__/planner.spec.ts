import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { exerciseDetails, usePlannerStore } from '@/stores/planner'
import { DATA_KEY, LEGACY_DATA_KEY, SETTINGS_KEY } from '@/lib/storage'

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

  it('never reads or writes the keys from before accounts', async () => {
    const legacy = JSON.stringify({ exercises: [{ id: 'a', name: 'A', reps: 1, target: 2 }] })
    const v2 = JSON.stringify({ plans: { '2026-10-19': [] }, log: {} })
    localStorage.setItem(LEGACY_DATA_KEY, legacy)
    localStorage.setItem(DATA_KEY, v2)
    setActivePinia(createPinia())
    const s = usePlannerStore()
    expect(s.exercises).toHaveLength(5)
    s.toggle('pu', 0)
    s.addExercise({ name: 'Lunges', reps: 12, perSide: true })
    await nextTick()
    expect(localStorage.getItem(LEGACY_DATA_KEY)).toBe(legacy)
    expect(localStorage.getItem(DATA_KEY)).toBe(v2)
  })

  it('toggles a cell on and off', () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    expect(s.isDone('pu', 0)).toBe(true)
    expect(s.totalFor('pu')).toBe(1)
    s.toggle('pu', 0)
    expect(s.isDone('pu', 0)).toBe(false)
    expect(s.log['2026-10-19']!.pu).toEqual([false, false, false, false, false, false, false])
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

  it('knows the real current week whichever week is on screen', () => {
    const s = usePlannerStore()
    s.nextWeek()
    expect(s.weekKey).toBe('2026-10-26')
    expect(s.currentWeekKey).toBe('2026-10-19')
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

  it('adds an exercise with goal 3 and ignores an empty name', () => {
    const s = usePlannerStore()
    expect(s.addExercise({ name: '   ', reps: 5, perSide: false })).toBe(false)
    expect(s.exercises).toHaveLength(5)
    expect(s.addExercise({ name: '  Lunges ', reps: 12, perSide: true })).toBe(true)
    const added = s.exercises[5]!
    expect(added).toMatchObject({ name: 'Lunges', reps: 12, perSide: true, target: 3 })
    expect(added.id).toMatch(/^x/)
    expect(s.plans['2026-10-19']).toHaveLength(6)
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

  it('adopts data and settings wholesale, and adopts one week at a time', () => {
    const s = usePlannerStore()
    const plan = [{ id: 'a', name: 'A', reps: 5, target: 2 }]
    s.adopt(
      {
        plans: { '2026-10-19': plan },
        log: { '2026-10-19': { a: [true, false, false, false, false, false, false] } },
      },
      { accent: '#ff9f0a', dailyPick: 5 },
    )
    expect(s.exercises).toEqual(plan)
    expect(s.grandTotal).toBe(1)
    expect([s.accent, s.dailyPick]).toEqual(['#ff9f0a', 5])
    expect(s.savedSettings()).toEqual({ accent: '#ff9f0a', dailyPick: 5 })
    s.adoptWeek('2026-10-19', [])
    expect(s.exercises).toEqual([])
    s.adopt({ plans: {}, log: {} }, null)
    expect(s.exercises).toHaveLength(5)
    expect([s.accent, s.dailyPick]).toEqual(['#30d158', 3])
    expect(s.savedSettings()).toBeNull()
  })

  it('clears the user’s data, the mode and the week on sign-out, but keeps the theme', () => {
    const s = usePlannerStore()
    s.toggle('pu', 0)
    s.setAccent('#bf5af2')
    s.setConfigMode(true)
    s.nextWeek()
    s.setTheme('dark')
    s.clear()
    expect(s.grandTotal).toBe(0)
    expect(s.accent).toBe('#30d158')
    expect(s.configMode).toBe(false)
    expect(s.weekOffset).toBe(0)
    expect(s.theme).toBe('dark')
  })

  it('clamps daily pick to 1–8, and a change counts as saved settings', () => {
    const s = usePlannerStore()
    expect(s.savedSettings()).toBeNull()
    s.setAccent('#bf5af2')
    expect(s.savedSettings()).toEqual({ accent: '#bf5af2', dailyPick: 3 })
    for (let i = 0; i < 10; i++) s.changeDailyPick(1)
    expect(s.dailyPick).toBe(8)
    for (let i = 0; i < 10; i++) s.changeDailyPick(-1)
    expect(s.dailyPick).toBe(1)
  })

  it('stores only the theme, merged into the device’s settings key', async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ accent: '#ff9f0a', dailyPick: 5, theme: 'light' }),
    )
    setActivePinia(createPinia())
    const s = usePlannerStore()
    expect(s.theme).toBe('light')
    // The accent and daily pick are the user's, from the server, not the device's.
    expect([s.accent, s.dailyPick]).toEqual(['#30d158', 3])
    s.setAccent('#bf5af2')
    s.setTheme('dark')
    await nextTick()
    expect(stored(SETTINGS_KEY)).toEqual({ accent: '#ff9f0a', dailyPick: 5, theme: 'dark' })
  })

  it('writes a settings key holding only the theme when there was none', async () => {
    const s = usePlannerStore()
    s.setTheme('light')
    await nextTick()
    expect(stored(SETTINGS_KEY)).toEqual({ theme: 'light' })
  })
})

describe('exerciseDetails', () => {
  it('formats per set, per side and missing reps', () => {
    expect(exerciseDetails({ id: 'a', name: 'A', reps: 10, target: 3 })).toEqual(['10 reps / set'])
    expect(exerciseDetails({ id: 'a', name: 'A', reps: 8, perSide: true, target: 3 })).toEqual([
      '8 each side / set',
    ])
    expect(exerciseDetails({ id: 'a', name: 'A', reps: 0, target: 3 })).toEqual(['—'])
  })

  it('appends the weight, or shows it alone without reps', () => {
    expect(exerciseDetails({ id: 'a', name: 'A', reps: 15, weight: 12, target: 3 })).toEqual([
      '15 reps / set',
      '12 kg',
    ])
    expect(exerciseDetails({ id: 'a', name: 'A', reps: 0, weight: 2.5, target: 3 })).toEqual([
      '2.5 kg',
    ])
  })
})

describe('updateExercise', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('replaces the fields but keeps the id, goal and history', () => {
    const s = usePlannerStore()
    s.toggle('sq', 0)
    s.changeTarget('sq', 1)
    expect(
      s.updateExercise('sq', { name: ' Goblet squats ', reps: 12, perSide: false, weight: 12 }),
    ).toBe(true)
    expect(s.exercises.find((e) => e.id === 'sq')).toEqual({
      id: 'sq',
      name: 'Goblet squats',
      reps: 12,
      perSide: false,
      weight: 12,
      target: 5,
    })
    expect(s.totalFor('sq')).toBe(1)
  })

  it('drops the weight when cleared and rejects bad input', () => {
    const s = usePlannerStore()
    s.updateExercise('sq', { name: 'Squats', reps: 15, perSide: false, weight: 12 })
    s.updateExercise('sq', { name: 'Squats', reps: 15, perSide: false })
    expect(s.exercises.find((e) => e.id === 'sq')).not.toHaveProperty('weight')
    expect(s.updateExercise('sq', { name: '  ', reps: 1, perSide: false })).toBe(false)
    expect(s.updateExercise('nope', { name: 'X', reps: 1, perSide: false })).toBe(false)
    expect(s.exercises.find((e) => e.id === 'sq')!.name).toBe('Squats')
  })

  it('stores a weight given when adding', () => {
    const s = usePlannerStore()
    s.addExercise({ name: 'Swings', reps: 20, perSide: false, weight: 16 })
    expect(s.exercises.at(-1)).toMatchObject({ name: 'Swings', reps: 20, weight: 16, target: 3 })
    s.addExercise({ name: 'Plank', reps: 0, perSide: false, weight: -4 })
    expect(s.exercises.at(-1)).not.toHaveProperty('weight')
  })
})

describe('weekly plans', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  const names = (s: ReturnType<typeof usePlannerStore>) => s.exercises.map((e) => e.name)

  it('shows the defaults until something changes, then plans only the changed week', () => {
    const s = usePlannerStore()
    expect(names(s)).toHaveLength(5)
    expect(s.carriedFrom).toBeNull()
    expect(s.plans).toEqual({})
    s.changeTarget('pu', 1)
    expect(Object.keys(s.plans)).toEqual(['2026-10-19'])
  })

  it('carries the latest earlier plan forward to unplanned weeks', () => {
    const s = usePlannerStore()
    s.addExercise({ name: 'Swings', reps: 20, perSide: false, weight: 16 })
    s.nextWeek()
    s.nextWeek()
    expect(s.carriedFrom).toBe('2026-10-19')
    expect(names(s)).toContain('Swings')
    expect(s.plans).not.toHaveProperty('2026-11-02')
  })

  it('lets an unplanned week follow later edits until it is changed itself', () => {
    const s = usePlannerStore()
    s.changeTarget('pu', 1)
    s.nextWeek()
    s.prevWeek()
    s.updateExercise('sq', { name: 'Squats', reps: 15, perSide: false, weight: 12 })
    s.nextWeek()
    expect(s.exercises.find((e) => e.id === 'sq')!.weight).toBe(12)

    // A tick gives the week its own plan, so edits to the earlier week no longer reach it.
    s.toggle('sq', 0)
    expect(s.carriedFrom).toBeNull()
    s.prevWeek()
    s.updateExercise('sq', { name: 'Squats', reps: 15, perSide: false, weight: 16 })
    s.nextWeek()
    expect(s.exercises.find((e) => e.id === 'sq')!.weight).toBe(12)
  })

  it('edits, adds and removes in the visible week only', () => {
    const s = usePlannerStore()
    s.changeTarget('pu', 1)
    s.nextWeek()
    s.removeExercise('pu')
    s.addExercise({ name: 'Swings', reps: 20, perSide: false })
    s.changeTarget('sq', -1)
    expect(names(s)).not.toContain('Push-ups')
    s.prevWeek()
    expect(names(s)).toContain('Push-ups')
    expect(names(s)).not.toContain('Swings')
    expect(s.exercises.find((e) => e.id === 'sq')!.target).toBe(4)
  })

  it('copies the week to the next one, replacing what was there', () => {
    const s = usePlannerStore()
    s.updateExercise('sq', { name: 'Squats', sets: 3, reps: 15, perSide: false, weight: 12 })
    expect(s.nextWeekHasPlan).toBe(false)
    s.nextWeek()
    s.removeExercise('pu')
    s.prevWeek()
    expect(s.nextWeekHasPlan).toBe(true)
    s.copyToNextWeek()
    expect(s.plans['2026-10-26']).toEqual(s.plans['2026-10-19'])
    expect(s.plans['2026-10-26']![0]).not.toBe(s.plans['2026-10-19']![0])
    s.nextWeek()
    expect(names(s)).toContain('Push-ups')
    expect(s.exercises.find((e) => e.id === 'sq')).toMatchObject({ sets: 3, weight: 12 })
  })

  it('keeps ticks attached when a plan is copied, since ids carry over', () => {
    const s = usePlannerStore()
    s.nextWeek()
    s.toggle('pu', 2)
    s.prevWeek()
    s.copyToNextWeek()
    s.nextWeek()
    expect(s.totalFor('pu')).toBe(1)
  })

  it('starts in normal mode and toggles config mode without saving it', async () => {
    const s = usePlannerStore()
    expect(s.configMode).toBe(false)
    s.setConfigMode(true)
    expect(s.configMode).toBe(true)
    await nextTick()
    expect(localStorage.length).toBe(0)
  })
})

describe('exercise sets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('formats sets with reps, per side, or alone', () => {
    const e = { id: 'a', name: 'A', target: 3 }
    expect(exerciseDetails({ ...e, sets: 3, reps: 10 })).toEqual(['3 × 10 reps'])
    expect(exerciseDetails({ ...e, sets: 3, reps: 8, perSide: true })).toEqual(['3 × 8 each side'])
    expect(exerciseDetails({ ...e, sets: 4, reps: 0 })).toEqual(['4 sets'])
  })

  it('stores sets as a whole number capped at 20, and drops 0', () => {
    const s = usePlannerStore()
    s.addExercise({ name: 'A', sets: 3.7, reps: 10, perSide: false })
    s.addExercise({ name: 'B', sets: 99, reps: 10, perSide: false })
    s.addExercise({ name: 'C', sets: 0, reps: 10, perSide: false })
    const [a, b, c] = s.exercises.slice(-3)
    expect([a!.sets, b!.sets]).toEqual([3, 20])
    expect(c).not.toHaveProperty('sets')
  })
})

describe('savedSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('is tracked in memory, so blocked storage cannot hide a change', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const s = usePlannerStore()
    expect(s.savedSettings()).toBeNull()
    s.setAccent('#0a84ff')
    expect(s.savedSettings()).toEqual({ accent: '#0a84ff', dailyPick: 3 })
  })

  it('treats adopted settings as saved, and none adopted as unsaved', () => {
    const s = usePlannerStore()
    s.adopt({ plans: {}, log: {} }, { accent: '#ff9f0a', dailyPick: 2 })
    expect(s.savedSettings()).toEqual({ accent: '#ff9f0a', dailyPick: 2 })
    s.adopt({ plans: {}, log: {} }, null)
    expect(s.savedSettings()).toBeNull()
  })

  it('does not count a theme change: the theme is the device’s', async () => {
    const s = usePlannerStore()
    s.setTheme('dark')
    await nextTick()
    expect(s.savedSettings()).toBeNull()
  })
})
