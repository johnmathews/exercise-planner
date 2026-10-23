import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SETTINGS,
  defaultExercises,
  parsePlannerData,
  parseSettings,
  readKey,
  writeKey,
} from '@/lib/storage'

describe('parsePlannerData', () => {
  it('returns the default exercises and an empty log when nothing is stored', () => {
    expect(parsePlannerData(null)).toEqual({ exercises: defaultExercises(), log: {} })
  })

  it('falls back to defaults on invalid JSON', () => {
    expect(parsePlannerData('{not json')).toEqual({ exercises: defaultExercises(), log: {} })
  })

  it('round-trips a payload written by the design prototype unchanged', () => {
    const prototype = {
      exercises: [
        { id: 'pu', name: 'Push-ups', reps: 10, target: 4 },
        { id: 'kh', name: 'Kettlebell halos', reps: 8, perSide: true, target: 3 },
        { id: 'x1729700000000', name: 'Plank', reps: 0, perSide: false, target: 3 },
      ],
      log: { '2026-10-19': { pu: [true, false, true, false, false, false, false] } },
    }
    const parsed = parsePlannerData(JSON.stringify(prototype))
    expect(parsed.log).toEqual(prototype.log)
    expect(parsed.exercises.map((e) => e.id)).toEqual(['pu', 'kh', 'x1729700000000'])
    expect(parsed.exercises[1]).toEqual(prototype.exercises[1])
  })

  it('keeps exercises when log is missing (the prototype crashed here)', () => {
    const parsed = parsePlannerData(
      JSON.stringify({ exercises: [{ id: 'a', name: 'A', reps: 5, target: 2 }] }),
    )
    expect(parsed.exercises).toHaveLength(1)
    expect(parsed.log).toEqual({})
  })

  it('keeps the log when exercises is missing, restoring default exercises', () => {
    const log = { '2026-10-19': { pu: [true, true, false, false, false, false, false] } }
    const parsed = parsePlannerData(JSON.stringify({ log }))
    expect(parsed.exercises).toEqual(defaultExercises())
    expect(parsed.log).toEqual(log)
  })

  it('keeps an intentionally empty exercise list', () => {
    expect(parsePlannerData(JSON.stringify({ exercises: [], log: {} })).exercises).toEqual([])
  })

  it('drops malformed exercises and clamps or defaults bad fields', () => {
    const parsed = parsePlannerData(
      JSON.stringify({
        exercises: [
          { id: 'ok', name: 'Ok', reps: -4, target: 12 },
          { id: 'x', name: 'No target', reps: '7' },
          { name: 'No id' },
          null,
          'nope',
        ],
      }),
    )
    expect(parsed.exercises).toEqual([
      { id: 'ok', name: 'Ok', reps: 0, target: 7 },
      { id: 'x', name: 'No target', reps: 0, target: 3 },
    ])
  })

  it('normalises log arrays to seven booleans and drops bad weeks', () => {
    const parsed = parsePlannerData(
      JSON.stringify({
        exercises: [],
        log: {
          '2026-10-19': { a: [true, 1, 'yes'], b: 'nope' },
          'not-a-date': { a: [true] },
          '2026-10-26': 'nope',
        },
      }),
    )
    expect(parsed.log).toEqual({
      '2026-10-19': { a: [true, false, false, false, false, false, false] },
    })
  })
})

describe('parseSettings', () => {
  it('defaults to green accent and three a day', () => {
    expect(parseSettings(null)).toEqual({ accent: '#30d158', dailyPick: 3 })
    expect(DEFAULT_SETTINGS.accent).toBe('#30d158')
  })

  it('accepts valid values and clamps daily pick to 1–8', () => {
    expect(parseSettings(JSON.stringify({ accent: '#bf5af2', dailyPick: 20 }))).toEqual({
      accent: '#bf5af2',
      dailyPick: 8,
    })
    expect(parseSettings(JSON.stringify({ dailyPick: 0 })).dailyPick).toBe(1)
  })

  it('rejects a non-hex accent', () => {
    expect(parseSettings(JSON.stringify({ accent: 'red' })).accent).toBe('#30d158')
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS)
  })
})

describe('readKey / writeKey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('writes JSON and reads it back', () => {
    writeKey('k', { a: 1 })
    expect(readKey('k')).toBe('{"a":1}')
  })

  it('swallows storage errors so the app keeps running', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(readKey('k')).toBeNull()
    expect(() => writeKey('k', 1)).not.toThrow()
  })
})
