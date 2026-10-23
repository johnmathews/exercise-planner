# Architecture

> Purpose
>
> How the planner is put together: the component tree, the Pinia stores, what goes into
> `localStorage`, and the decisions that depart from the design prototype.

## 1. Overview

A static Vue 3 SPA with no backend. Two Pinia stores hold all state and write it back to
`localStorage`: `planner` (exercises, the visible week, settings) and `diet` (foods), which takes
its week from `planner`. Both track the same thing, a tick per day against a weekly goal, through
the pure helpers in `src/lib/tracker.ts`. `src/lib/dates.ts` holds the week maths (Monday of a week,
`YYYY-MM-DD` keys, labels, `DAY_NAMES`); `src/lib/theme.ts` holds the theme names and `isDark`.

`TrackerGrid`, `TrackerRow`, `DayCell` and `NumberStepper` take props, emit events, and serve both
sections; `TrackerRow` also asks `window.confirm` before emitting `remove`. `ExerciseGrid` and
`DietSection` wire them to their store. `AddExerciseForm` and `EditExerciseDialog` share their field
state and input cleaning through `useExerciseForm` (`src/composables/exerciseForm.ts`) and the
`PerSideToggle` segmented control.

```
App.vue                 navbar + main column, --accent variable, .dark class, clock refresh,
│                       cross-tab sync
├── AppNavbar.vue       sticky top bar: app name, ‹ This Week ›, Settings, Print…
│   └── SettingsPopover.vue   theme (System/Light/Dark), accent swatches, exercises-per-day stepper
├── WeekHeader.vue      H1 week label, daily-pick hint, grand total
├── ExerciseGrid.vue    wires planner to a TrackerGrid: reps/weight chips, edit, "Picked / N" footer
│   ├── TrackerGrid.vue CSS grid: header row, one TrackerRow per item, footer counts
│   │   └── TrackerRow.vue  name (+ optional chips), ✎ edit (if editable), × remove (confirms),
│   │                       7 × DayCell, total + goal NumberStepper
│   └── EditExerciseDialog.vue  native modal: name, reps, PerSideToggle, weight; Cancel / Save
├── AddExerciseForm.vue name, digits-only reps, PerSideToggle, optional weight (kg), Add Exercise
└── DietSection.vue     "Diet" heading with goals met
    ├── TrackerGrid.vue wired to diet: no chips, neutral "Eaten" footer
    └── AddFoodForm.vue name, Add Food
```

## 2. Stores

`usePlannerStore` is a setup store.

| State                 | Persisted                      | Notes                                                   |
| --------------------- | ------------------------------ | ------------------------------------------------------- |
| `exercises`           | `exercise-planner-v1`          | `{ id, name, reps, perSide?, weight?, target }`         |
| `log`                 | `exercise-planner-v1`          | week Monday `YYYY-MM-DD` → exercise id → seven booleans |
| `accent`, `dailyPick` | `exercise-planner-settings-v1` | defaults `#30d158`, `3`                                 |
| `theme`               | `exercise-planner-settings-v1` | `system` (default), `light` or `dark`                   |
| `weekOffset`          | no                             | `0` is the current week                                 |
| `now`                 | no                             | a ref so "today" can move; see §4                       |

**Derived:** `monday`, `weekKey`, `label`, `days` (name, date, key, `isToday`), `dayCounts`,
`grandTotal`, and the helpers `isDone(id, day)` and `totalFor(id)`. Totals count only exercises that
still exist, so a removed exercise's history stays in `log` without inflating the numbers.

**Actions:** `toggle`, `changeTarget` (clamps 0–7), `addExercise` (returns `false` for an empty
name; new exercises get goal 3), `updateExercise` (replaces name, reps, per-side and weight, keeping
the id, goal and history; `false` for an empty name or unknown id), `removeExercise`, `prevWeek`,
`nextWeek`, `thisWeek`, `refreshNow`, `syncFromStorage`, `setAccent`, `changeDailyPick` (clamps
1–8), `setTheme`. The module also exports `exerciseDetails`, which gives the chips under a name:
"10 reps / set" or "8 each side / set", then "12 kg" when a weight is set, or "—" for neither.

`useDietStore` holds `foods` (`{ id, name, target }`) and its own `log`, persisted together under
`exercise-planner-diet-v1`. It reads `planner.weekKey`, so week navigation moves both sections. It
derives `dayCounts`, `grandTotal` and `goalsMet`, and offers `isEaten`, `totalFor`, `toggle`,
`changeTarget` (0–7), `addFood` (goal 3, `false` for an empty name), `removeFood` and
`syncFromStorage`. Food goals work like exercise goals (met once the count reaches a non-zero goal);
foods have no daily target.

Watchers persist state: a deep one per data payload and a shallow one for the settings. `writeKey`
skips the write when the stored string already matches, and swallows storage errors, so with storage
blocked or full the app keeps working in memory.

## 3. Storage format and validation

`exercise-planner-v1` uses the prototype's key, shape and key order, including its explicit
`perSide: false`, so prototype data on the same origin loads and re-serialises byte for byte.
Browsers isolate storage per origin, so data does not move between hosts. Settings
(`exercise-planner-settings-v1`) and diet (`exercise-planner-diet-v1`) live under their own keys so
the exercise payload stays prototype-compatible.

`parsePlannerData` (`src/lib/storage.ts`) validates the stored payload field by field:

- Anything that is not a JSON object yields the five default exercises and an empty log.
- `exercises` that is not an array restores the defaults; an empty array stays empty.
- `weight` (kg) is kept only when it is a positive number, rounded to 2 decimals and capped at 500;
  otherwise the key is left out, so prototype data never gains one.
- Entries without a string `id` and `name` drop out; `reps` rounds and floors at 0; `target` rounds
  and clamps to 0–7, defaulting to 3.
- Log weeks whose key is not `YYYY-MM-DD`, and entries that are not arrays, drop out; the rest
  normalise to exactly seven booleans.

The prototype trusted its stored data and crashed outright on a payload without `log`.

`parseDietData` applies the same rules to `{ foods, log }`: four default foods (Vegetables 7, Fruit
5, Fish 2, Nuts 3) when the payload or `foods` is unusable, and goals clamped to 0–7, defaulting
to 3.

`parseSettings` accepts any `#rrggbb` accent (not only the four swatches), clamps the daily pick
to 1–8, and accepts only `system`, `light` or `dark` as the theme, falling back to the defaults
otherwise. Settings saved before the theme option existed load as `system`.

## 4. Decisions beyond the design

- **Cells are buttons.** The prototype's cells were clickable `div`s. `DayCell` renders a `button`
  with `aria-pressed` and a label such as "Squats, Fri 23", so the grid works from the keyboard and
  with a screen reader. The grid carries ARIA `table`/`row`/`cell` roles.
- **A normal web page, not a window.** The handoff drew the app as a macOS window (traffic lights,
  a framed window on a backdrop). The app is an SPA, so it uses a full-width sticky navbar and a
  centred content column instead; the navbar keeps the week controls, Settings and Print….
- **Light and dark themes.** The handoff is dark-only. Settings offers System (the default, which
  follows `prefers-color-scheme` live), Light and Dark. `App.vue` toggles a `dark` class on
  `<html>`; `public/theme-init.js` applies the saved choice before first paint so a dark preference
  does not flash light while the bundle loads. It is a plain file rather than an inline script
  because the nginx CSP allows scripts only from `'self'`.
- **Settings popover.** The handoff calls accent and daily pick user settings but shows no UI for
  them; the popover adds one, plus the theme. The default accent is green (`#30d158`), which the
  handoff records as the user's pick. It is a disclosure: an outside click or Escape closes it, and
  Escape returns focus to the trigger. Swatches, the theme buttons and the per-set toggle are
  `aria-pressed` buttons.
- **Exercises are editable.** The handoff had no way to change an exercise after adding it. A ✎
  button on each exercise row (not foods) opens `EditExerciseDialog`, a native `<dialog>` opened
  with `showModal()`, which traps focus, closes on Escape and returns focus to the button. The
  weight is optional and in kg; reps and weight show as separate chips so they wrap in the narrow
  name column.
- **Steppers mark their bounds** (goal 0/7, daily pick 1/8) with `aria-disabled` and ignore the
  click there. `disabled` would drop keyboard focus mid-press. The store still clamps as a backstop.
- **Today refreshes.** A one-minute tick and `visibilitychange` both call `refreshNow`, which
  updates `now` only when the date has changed. A tab left open past midnight moves its highlighted
  column within a minute.
- **Tabs stay in sync.** `App.vue` listens for `storage` events and calls both stores'
  `syncFromStorage`, so a stale tab adopts another tab's edits instead of overwriting them with its
  old state.
- **Diet sits below the exercises** on the same page, sharing the week navigation and the print
  sheet. It has no daily target, so its footer counts are neutral rather than accent/orange.
- **Print is black on white in either theme.** The print block in `src/styles/main.css` swaps the
  colour tokens for print values: off cells and the today column print white, and only done cells
  print black with a white tick. The navbar, add forms, remove buttons and steppers are hidden
  (`data-noprint`), and each grid avoids splitting across pages.
- **Narrow screens.** The navbar drops the app name below 640px so the controls fit at phone width;
  the grid scrolls sideways at its 780px minimum width, as designed.

## 5. Styling

Tailwind CSS 4, through `@tailwindcss/vite`. Components style themselves with utility classes in
their templates and have no `<style>` blocks. Everything global is in `src/styles/main.css`:

- **Semantic colours.** `:root` (light) and `.dark` define variables such as `--surface`, `--line`
  and `--muted`, and `@theme inline` exposes them as Tailwind colours, so templates write
  `bg-surface`, `border-line` or `text-muted` and both themes follow without `dark:` variants.
- **Accent.** `App.vue` sets `--accent` on `<html>` from the store; it backs `bg-accent`. Text uses
  `text-accent-fg`, which light mode darkens (the swatches are too bright to read on white).
- **Dark variant.** `@custom-variant dark` keys `dark:` to the `.dark` class rather than the media
  query, so the Light and Dark settings can override the OS.
- **Shared classes.** `.btn` (navbar buttons), `.segment` (the theme and per-set toggles),
  `.btn-primary` and `.field` (the add forms) live in the components layer.
- **Sticky navbar.** `scroll-padding-top` on `<html>` keeps keyboard-focused content from scrolling
  under it.
- **Print.** The `@media print` block described in §4.
