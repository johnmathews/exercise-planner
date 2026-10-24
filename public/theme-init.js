// Runs before first paint so a dark preference doesn't flash the light theme while the app loads.
// Mirrors isDark() in src/lib/theme.ts and the settings key in src/lib/storage.ts. A plain file
// rather than an inline script, because the nginx CSP only allows scripts from 'self'.
// The block keeps these names out of the global lexical scope. On the first load after the rename
// the settings still sit under the old name, until migrateKeyPrefix() in src/main.ts moves them.
{
  let theme
  try {
    const raw =
      localStorage.getItem('fitness-planner-settings-v1') ||
      localStorage.getItem('exercise-planner-settings-v1')
    theme = JSON.parse(raw || '{}').theme
  } catch {
    // Storage blocked or malformed: fall through and follow the OS, as the "System" default does.
  }
  const dark =
    theme === 'dark' ||
    (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}
