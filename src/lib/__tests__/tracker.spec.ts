import { describe, expect, it } from 'vitest'
import {
  dayCounts,
  goalMet,
  goalsMet,
  grandTotal,
  isDone,
  newId,
  toggleDay,
  totalFor,
  type WeekLog,
} from '@/lib/tracker'
import type { Log } from '@/lib/storage'

const items = [
  { id: 'a', name: 'A', target: 2 },
  { id: 'b', name: 'B', target: 0 },
  { id: 'c', name: 'C', target: 1 },
]
const week: WeekLog = {
  a: [true, true, false, false, false, false, false],
  b: [true, false, false, false, false, false, false],
  gone: [true, true, true, true, true, true, true],
}

describe('tracker helpers', () => {
  it('reads single days and per-item totals, treating missing items as empty', () => {
    expect(isDone(week, 'a', 1)).toBe(true)
    expect(isDone(week, 'a', 2)).toBe(false)
    expect(isDone(week, 'c', 0)).toBe(false)
    expect(totalFor(week, 'a')).toBe(2)
    expect(totalFor(week, 'c')).toBe(0)
  })

  it('counts per day and in total over listed items only', () => {
    expect(dayCounts(items, week)).toEqual([2, 1, 0, 0, 0, 0, 0])
    expect(grandTotal(items, week)).toBe(3)
  })

  it('meets a goal only when it is above zero and reached', () => {
    expect(goalMet(2, 2)).toBe(true)
    expect(goalMet(3, 2)).toBe(true)
    expect(goalMet(1, 2)).toBe(false)
    expect(goalMet(1, 0)).toBe(false)
    expect(goalsMet(items, week)).toBe(1)
  })

  it('toggles a day, creating the week and the flags on first use', () => {
    const log: Log = {}
    toggleDay(log, '2026-10-19', 'a', 3)
    expect(log).toEqual({ '2026-10-19': { a: [false, false, false, true, false, false, false] } })
    toggleDay(log, '2026-10-19', 'a', 3)
    expect(log['2026-10-19']!.a![3]).toBe(false)
  })

  it('makes distinct x-prefixed ids', () => {
    const a = newId()
    expect(a).toMatch(/^x[0-9a-z]+$/)
    expect(newId()).not.toBe(a)
  })
})
