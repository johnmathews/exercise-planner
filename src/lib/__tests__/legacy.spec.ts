import { beforeEach, describe, expect, it } from 'vitest'
import { readLegacyData } from '@/lib/legacy'
import { DATA_KEY, DIET_KEY, LEGACY_DATA_KEY, LEGACY_DIET_KEY, SETTINGS_KEY } from '@/lib/storage'

const WEEK = '2026-10-19'

describe('readLegacyData', () => {
  beforeEach(() => localStorage.clear())

  it('finds nothing in a browser that never used the app before accounts', () => {
    expect(readLegacyData(WEEK)).toBeNull()
  })

  it('finds nothing when only the theme was ever saved', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'dark' }))
    expect(readLegacyData(WEEK)).toBeNull()
  })

  it('reads the v2 keys and the accent and daily pick, but never the theme', () => {
    const exercise = {
      plans: { [WEEK]: [{ id: 'sq', name: 'Squats', reps: 15, target: 4 }] },
      log: { [WEEK]: { sq: [true, false, false, false, false, false, false] } },
    }
    const diet = {
      plans: {},
      log: { [WEEK]: { veg: [false, true, false, false, false, false, false] } },
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(exercise))
    localStorage.setItem(DIET_KEY, JSON.stringify(diet))
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ accent: '#0a84ff', dailyPick: 5, theme: 'dark' }),
    )
    expect(readLegacyData(WEEK)).toEqual({
      exercise,
      diet,
      settings: { accent: '#0a84ff', dailyPick: 5 },
    })
  })

  it('migrates the single-list format from before weekly plans', () => {
    localStorage.setItem(
      LEGACY_DATA_KEY,
      JSON.stringify({
        exercises: [{ id: 'a', name: 'A', reps: 1, target: 2 }],
        log: { '2026-10-12': { a: [true, false, false, false, false, false, false] } },
      }),
    )
    localStorage.setItem(LEGACY_DIET_KEY, JSON.stringify({ foods: [], log: {} }))
    const data = readLegacyData(WEEK)!
    expect(Object.keys(data.exercise.plans).sort()).toEqual(['2026-10-12', WEEK])
    expect(data.diet.plans).toEqual({ [WEEK]: [] })
    expect(data.settings).toBeNull()
  })

  it('counts settings alone as data worth offering', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accent: '#bf5af2', dailyPick: 2 }))
    expect(readLegacyData(WEEK)).toEqual({
      exercise: { plans: {}, log: {} },
      diet: { plans: {}, log: {} },
      settings: { accent: '#bf5af2', dailyPick: 2 },
    })
  })

  it('survives keys that are not valid JSON', () => {
    localStorage.setItem(DATA_KEY, '{broken')
    localStorage.setItem(SETTINGS_KEY, '[1]')
    expect(readLegacyData(WEEK)).toBeNull()
  })
})
