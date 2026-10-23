export const THEMES = ['system', 'light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme)
}

/** "System" follows the OS setting; the other two override it. */
export function isDark(theme: Theme, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark)
}
