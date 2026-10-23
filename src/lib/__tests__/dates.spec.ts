import { describe, expect, it } from 'vitest'
import { dateKey, formatShort, mondayOf, weekDates, weekLabel } from '@/lib/dates'

describe('mondayOf', () => {
  it('returns the same day at midnight for a Monday', () => {
    const m = mondayOf(new Date(2026, 9, 19, 15, 30))
    expect(dateKey(m)).toBe('2026-10-19')
    expect(m.getHours()).toBe(0)
  })

  it('maps Sunday back to the preceding Monday (weeks are Mon–Sun)', () => {
    expect(dateKey(mondayOf(new Date(2026, 9, 25)))).toBe('2026-10-19')
  })

  it('shifts by whole weeks with an offset', () => {
    const now = new Date(2026, 9, 23)
    expect(dateKey(mondayOf(now, -1))).toBe('2026-10-12')
    expect(dateKey(mondayOf(now, 2))).toBe('2026-11-02')
  })

  it('crosses a year boundary', () => {
    expect(dateKey(mondayOf(new Date(2027, 0, 2)))).toBe('2026-12-28')
  })
})

describe('dateKey', () => {
  it('zero-pads month and day', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('weekDates', () => {
  it('returns seven consecutive days, including across a DST change', () => {
    const keys = weekDates(new Date(2026, 9, 19)).map(dateKey)
    expect(keys).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })
})

describe('labels', () => {
  it('formats a short date', () => {
    expect(formatShort(new Date(2026, 9, 19))).toBe('Oct 19')
  })

  it('formats the week label with the Sunday year', () => {
    expect(weekLabel(new Date(2026, 9, 19))).toBe('Oct 19 – Oct 25, 2026')
    expect(weekLabel(new Date(2026, 11, 28))).toBe('Dec 28 – Jan 3, 2027')
  })
})
