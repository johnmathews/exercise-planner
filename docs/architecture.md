# Architecture

> Purpose
>
> How the planner is put together: the component tree, the Pinia store, what goes into
> `localStorage`, and the decisions that depart from the design prototype.

## 1. Overview

A static Vue 3 SPA with no backend. One Pinia store (`src/stores/planner.ts`) holds all state,
derives everything the view shows, and writes changes back to `localStorage`. Components read
the store directly; none of them keep domain state of their own.

```
App.vue                 page background, window, --accent variable, visibility refresh
├── TitleBar.vue        traffic lights, week label, ‹ This Week ›, Settings, Print…
│   └── SettingsPopover.vue   accent swatches, exercises-per-day stepper
├── WeekHeader.vue      H1 week label, daily-pick hint, grand total
├── PlannerGrid.vue     CSS grid: header row, rows, footer counts
│   └── ExerciseRow.vue name + reps chip, 7 × DayCell, total + GoalStepper
└── AddExerciseForm.vue name, digits-only reps, per set / each side, submit
```

## 2. Store

`usePlannerStore` is a setup store.

| State | Persisted | Notes |
| --- | --- | --- |
| `exercises` | `exercise-planner-v1` | `{ id, name, reps, perSide?, target }` |
| `log` | `exercise-planner-v1` | week Monday `YYYY-MM-DD` → exercise id → seven booleans |
| `accent`, `dailyPick` | `exercise-planner-settings-v1` | defaults `#30d158`, `3` |
| `weekOffset` | no | `0` is the current week |
| `now` | no | a ref so "today" can move; see §4 |

Derived values: `monday`, `weekKey`, `label`, `days` (name, date, key, `isToday`), `dayCounts`,
`grandTotal`, and the helpers `isDone(id, day)` and `totalFor(id)`. Totals count only exercises
that still exist, so a removed exercise's history stays in `log` without inflating the numbers.

Two deep watchers persist the data and the settings under separate keys. Each write runs in a
`try`/`catch`: with storage blocked or full, the app keeps working in memory.

## 3. Storage compatibility

`exercise-planner-v1` uses the same key and shape as the design prototype, so data saved by the
prototype loads unchanged on the same origin (browsers isolate storage per origin, so data does
not move between hosts). Settings live under a second key so that the data payload stays
byte-compatible with the prototype.

`parsePlannerData` (`src/lib/storage.ts`) validates the stored payload field by field instead of
trusting it. Invalid JSON yields the defaults; a missing `exercises` restores the five default
exercises; a malformed `log` becomes `{}`; bad exercises drop out; goals clamp to 0–7; log arrays
normalise to exactly seven booleans. The prototype crashed outright on a payload without `log`.

## 4. Decisions beyond the design

- **Cells are buttons.** The prototype's cells were clickable `div`s. `DayCell` renders a
  `button` with `aria-pressed` and a label such as "Squats, Fri 23", so the grid works from the
  keyboard and with a screen reader. The grid carries ARIA `table`/`row`/`cell` roles.
- **Settings popover.** The handoff calls accent and daily pick user settings but shows no UI
  for them; the popover adds one. The default accent is green (`#30d158`), which the handoff
  records as the user's pick.
- **Steppers disable at their bounds** (goal 0/7, daily pick 1/8) instead of silently clamping.
- **Today refreshes.** On `visibilitychange` the store re-reads the clock, so a tab left open
  overnight moves the highlighted column.
- **Form fields are `content-box`.** That matches the prototype as rendered (34px fields, 92px
  reps box) rather than the README's nominal 32px/70px, which describe the content box.
- **Print hides the dark fills.** Off cells and the today column print white; only done cells
  print black with a white tick. Rules live in `src/styles/print.css`.
- **Narrow screens** get a tighter page gutter below 600px; the grid scrolls sideways at its
  780px minimum width, as designed.

## 5. Styling

Design tokens are CSS custom properties in `src/styles/tokens.css`. `--accent` is set on `:root`
at runtime from the store. Component styles are scoped; the print stylesheet uses `!important`
and the `data-window`, `data-surface`, `data-noprint` and `data-on` attributes, as the prototype did.
