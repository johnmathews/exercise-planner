# Architecture

> Purpose
>
> How the planner is put together: the component tree, the Pinia stores, what goes into
> `localStorage`, and the decisions that depart from the design prototype.

## 1. Overview

A static Vue 3 SPA with no backend. Two Pinia stores hold all state and write it back to
`localStorage`: `planner` (exercises, the visible week, settings) and `diet` (foods), which takes
its week from `planner`. Both track the same thing, a tick per day against a weekly goal, through
the pure helpers in `src/lib/tracker.ts`.

`TrackerGrid`, `TrackerRow`, `DayCell` and `NumberStepper` are props-in, events-out and serve both
sections. `ExerciseGrid` and `DietSection` wire them to their store.

```
App.vue                 page, window, --accent variable, clock refresh, cross-tab sync
├── TitleBar.vue        traffic lights, week label, ‹ This Week ›, Settings, Print…
│   └── SettingsPopover.vue   accent swatches, exercises-per-day NumberStepper
├── WeekHeader.vue      H1 week label, daily-pick hint, grand total
├── ExerciseGrid.vue    TrackerGrid wired to planner: reps chips, "Picked / N" footer
├── AddExerciseForm.vue name, digits-only reps, "per set" | "each side, per set", Add Exercise
└── DietSection.vue     "Diet" heading with goals met, TrackerGrid wired to diet, AddFoodForm

TrackerGrid.vue         CSS grid: header row, one TrackerRow per item, footer counts
└── TrackerRow.vue      name (+ optional chip), 7 × DayCell, total + goal NumberStepper
```

## 2. Stores

`usePlannerStore` is a setup store.

| State                 | Persisted                      | Notes                                                   |
| --------------------- | ------------------------------ | ------------------------------------------------------- |
| `exercises`           | `exercise-planner-v1`          | `{ id, name, reps, perSide?, target }`                  |
| `log`                 | `exercise-planner-v1`          | week Monday `YYYY-MM-DD` → exercise id → seven booleans |
| `accent`, `dailyPick` | `exercise-planner-settings-v1` | defaults `#30d158`, `3`                                 |
| `weekOffset`          | no                             | `0` is the current week                                 |
| `now`                 | no                             | a ref so "today" can move; see §4                       |

**Derived:** `monday`, `weekKey`, `label`, `days` (name, date, key, `isToday`), `dayCounts`,
`grandTotal`, and the helpers `isDone(id, day)` and `totalFor(id)`. Totals count only exercises
that still exist, so a removed exercise's history stays in `log` without inflating the numbers.

**Actions:** `toggle`, `changeTarget` (clamps 0–7), `addExercise` (returns `false` for an empty
name; new exercises get goal 3), `removeExercise`, `prevWeek`, `nextWeek`, `thisWeek`,
`refreshNow`, `syncFromStorage`, `setAccent`, `changeDailyPick` (clamps 1–8). The module also
exports `repsLabel`, which renders "10 reps / set", "8 each side / set" or "—".

`useDietStore` holds `foods` (`{ id, name, target }`) and its own `log`, persisted together under
`exercise-planner-diet-v1`. It reads `planner.weekKey`, so week navigation moves both sections.
It derives `dayCounts`, `grandTotal` and `goalsMet`, and offers `isEaten`, `totalFor`, `toggle`,
`changeTarget` (0–7), `addFood` (goal 3, `false` for an empty name), `removeFood` and
`syncFromStorage`. Foods have aim-for goals only: met once the count reaches a non-zero goal.

Watchers persist state: a deep one per data payload and a shallow one for the settings. `writeKey` skips the write when the stored string already matches, and swallows
storage errors, so with storage blocked or full the app keeps working in memory.

## 3. Storage format and validation

`exercise-planner-v1` uses the prototype's key, shape and key order, including its explicit
`perSide: false`, so prototype data on the same origin loads and re-serialises byte for byte.
Browsers isolate storage per origin, so data does not move between hosts. Settings
(`exercise-planner-settings-v1`) and diet (`exercise-planner-diet-v1`) live under their own keys so
the exercise payload stays prototype-compatible.

`parsePlannerData` (`src/lib/storage.ts`) validates the stored payload field by field:

- Anything that is not a JSON object yields the five default exercises and an empty log.
- `exercises` that is not an array restores the defaults; an empty array stays empty.
- Entries without a string `id` and `name` drop out; `reps` rounds and floors at 0; `target`
  rounds and clamps to 0–7, defaulting to 3.
- Log weeks whose key is not `YYYY-MM-DD`, and entries that are not arrays, drop out; the rest
  normalise to exactly seven booleans.

`parseDietData` applies the same rules to `{ foods, log }`: four default foods (Vegetables 7,
Fruit 5, Fish 2, Nuts 3) when the payload or `foods` is unusable, and goals clamped to 0–7,
defaulting to 3.

`parseSettings` accepts any `#rrggbb` accent (not only the four swatches) and clamps the daily
pick to 1–8, falling back to the defaults otherwise. The prototype trusted its stored data and
crashed outright on a payload without `log`.

## 4. Decisions beyond the design

- **Cells are buttons.** The prototype's cells were clickable `div`s. `DayCell` renders a
  `button` with `aria-pressed` and a label such as "Squats, Fri 23", so the grid works from the
  keyboard and with a screen reader. The grid carries ARIA `table`/`row`/`cell` roles.
- **Settings popover.** The handoff calls accent and daily pick user settings but shows no UI
  for them; the popover adds one. The default accent is green (`#30d158`), which the handoff
  records as the user's pick. It is a disclosure: an outside click or Escape closes it, and
  Escape returns focus to the trigger. Swatches and the per-set toggle are `aria-pressed` buttons.
- **Steppers mark their bounds** (goal 0/7, daily pick 1/8) with `aria-disabled` and ignore the
  click there. `disabled` would drop keyboard focus mid-press. The store still clamps as a backstop.
- **Today refreshes.** A one-minute tick and `visibilitychange` both call `refreshNow`, which
  updates `now` only when the date has changed. A tab left open past midnight moves its
  highlighted column within a minute.
- **Tabs stay in sync.** `App.vue` listens for `storage` events and calls both stores'
  `syncFromStorage`, so a stale tab adopts another tab's edits instead of overwriting them with
  its old state.
- **Diet sits below the exercises** in the same window, sharing the week navigation and the
  print sheet. It has no daily target, so its footer counts are neutral rather than
  accent/orange.
- **Form fields are `content-box`.** That matches the prototype as rendered (34px fields, 92px
  reps box) rather than the README's nominal 32px/70px, which describe the content box.
- **Print hides the dark fills.** Off cells and the today column print white; only done cells
  print black with a white tick. The add forms are hidden, so each grid gets its own bottom
  padding. Rules live in `src/styles/print.css`.
- **Narrow screens** get a tighter page gutter below 600px; the grid scrolls sideways at its
  780px minimum width, as designed.

## 5. Styling

Design tokens are CSS custom properties in `src/styles/tokens.css`; `src/styles/forms.css` holds
the field and primary-button classes both add forms share. `--accent` is set on `:root`
at runtime from the store. Component styles are scoped; the print stylesheet uses `!important`
and the `data-window`, `data-surface`, `data-noprint` and `data-on` attributes, as the prototype did.
