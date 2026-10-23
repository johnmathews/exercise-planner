import { describe, expect, it } from 'vitest'
import { copyPlan, planSource } from '@/lib/plans'

describe('planSource', () => {
  const plans = { '2026-10-05': [], '2026-10-19': [] }

  it('uses the week’s own plan when it has one', () => {
    expect(planSource(plans, '2026-10-19')).toBe('2026-10-19')
  })

  it('carries the latest earlier plan forward', () => {
    expect(planSource(plans, '2026-10-12')).toBe('2026-10-05')
    expect(planSource(plans, '2026-11-30')).toBe('2026-10-19')
  })

  it('uses the earliest plan for weeks before any plan, and null with none', () => {
    expect(planSource(plans, '2026-09-28')).toBe('2026-10-05')
    expect(planSource({}, '2026-10-19')).toBeNull()
  })
})

describe('copyPlan', () => {
  it('copies each item so edits stay in the copy', () => {
    const items = [{ id: 'a', target: 3 }]
    const copy = copyPlan(items)
    copy[0]!.target = 5
    expect(items[0]!.target).toBe(3)
  })
})
