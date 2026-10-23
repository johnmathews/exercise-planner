import { describe, expect, it } from 'vitest'
import { THEMES, isDark, isTheme } from '@/lib/theme'

describe('isTheme', () => {
  it('accepts the three themes and nothing else', () => {
    for (const t of THEMES) expect(isTheme(t)).toBe(true)
    expect(isTheme('sepia')).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })
})

describe('isDark', () => {
  it('follows the OS for system and overrides it otherwise', () => {
    expect(isDark('system', true)).toBe(true)
    expect(isDark('system', false)).toBe(false)
    expect(isDark('dark', false)).toBe(true)
    expect(isDark('light', true)).toBe(false)
  })
})
