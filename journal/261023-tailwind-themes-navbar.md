# Tailwind, light and dark themes, normal navbar

## What changed

After seeing the app running, John asked for three things: use Tailwind, support dark and light
mode, and drop the macOS-window look ("you took the 'make it look like macOS' a bit too far"). That
meant no traffic lights and no window inside the page, just a normal web app with a normal navbar
that keeps the This Week, Settings and Print buttons.

- **Tailwind CSS 4** through `@tailwindcss/vite`. Every component's scoped `<style>` block is gone;
  the four stylesheets (`tokens.css`, `base.css`, `forms.css`, `print.css`) are now one
  `src/styles/main.css`. `prettier-plugin-tailwindcss` sorts class lists.
- **Themes.** Settings has an Appearance control: System (default), Light, Dark, stored as `theme`
  in `exercise-planner-settings-v1`. Older settings without the field load as System.
- **Layout.** `TitleBar.vue` became `AppNavbar.vue`, a full-width sticky bar with the favicon, app
  name, week arrows, Settings and Print…. The page is a centred `max-w-6xl` column on a plain
  background, with no frame, shadow or backdrop gradient.

## Decisions

- **Semantic tokens, not `dark:` everywhere.** `:root` and `.dark` set variables (`--surface`,
  `--line`, `--muted`, …) that `@theme inline` exposes as Tailwind colours. Templates say
  `bg-surface` once and both themes work. Dark surfaces keep the original design's values; the
  grey text tones were lightened in dark and darkened in light so they meet WCAG AA contrast.
- **Accent text is darkened in light mode** (`--accent-fg`, a 62% mix with black). The four accent
  swatches are bright system colours that are hard to read as text on white; fills (done cells, the
  dot) still use the raw accent.
- **The `dark` variant uses a class**, so the Light and Dark settings can override the OS. System
  listens to `prefers-color-scheme` changes live.
- **No-flash script as a file.** `public/theme-init.js` sets the class before first paint. It is a
  file and not an inline script because the nginx CSP is `script-src 'self'` (via `default-src`).
  It repeats the settings key and the `isDark` rule by hand, and comments point both ways.
- **Print swaps tokens** instead of overriding every element with `!important`. Only `--accent`
  needs `!important`, to beat the inline style the app sets on `<html>`.
- **Tests use data attributes.** With utility classes, class names stop being stable hooks, so
  tests now query `data-testid`, `data-today`, `data-tone` and `data-met`.
- The prototype's content-box form fields (34px) are now ordinary 36px Tailwind fields; matching
  the window design pixel for pixel no longer applies.

## Review fixes

A fresh-eyes review caught five things, all fixed:

- Today's header tint lost to `bg-subtle`, because Tailwind orders utilities itself.
- The week buttons' focus ring was clipped by `overflow-hidden`.
- Selected segments were nearly invisible; a `--selected` token and a ring fix that.
- Light-mode grey text and the met-goal counts missed AA contrast.
- The sticky navbar could cover focused cells; `scroll-padding-top` fixes that.

Separately, the no-flash script now follows the OS even when storage is blocked.

## Verified

- 82 tests pass (7 new: theme parsing, store persistence, `isDark`, and three App tests with a
  stubbed `matchMedia`). Lint, type-check and build are clean.
- In Playwright, at 1280px in light and dark, the settings panel, phone width (390px, no
  horizontal scroll after the navbar was tightened) and print emulation from dark mode (white sheet,
  black done cells) all rendered correctly.
- In the Docker image, `theme-init.js` is served `no-cache`, there are no CSP errors, and a stored
  Dark choice applies with the OS set to light.
