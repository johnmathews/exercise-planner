# Architecture

> Purpose
>
> How the planner is put together: the component tree, the Pinia stores, what goes into
> `localStorage`, and the decisions that depart from the design prototype.

## 1. Overview

A Vue 3 SPA. The API service in `api/` ([api.md](api.md)) holds accounts and synced data, but the
client does not call it yet. Until then the app runs without a backend. Two Pinia stores hold all state and write it back to
`localStorage`: `planner` (exercise plans, the log, the visible week, settings, the mode) and `diet`
(food plans and their log), which takes its week from `planner`. Both track the same thing, a tick
per day against a weekly goal, through the pure helpers in `src/lib/tracker.ts`. `src/lib/plans.ts`
decides which week's plan a week shows; `src/lib/dates.ts` holds the week maths (Monday of a week,
`YYYY-MM-DD` keys and back, labels, `DAY_NAMES`); `src/lib/theme.ts` holds the theme names and
`isDark`.

`TrackerGrid`, `TrackerRow`, `DayCell` and `NumberStepper` take props, emit events, and serve both
sections; `TrackerRow` also asks `window.confirm` before emitting `remove`. `ExerciseGrid` and
`DietSection` wire them to their store. `AddExerciseForm` and `EditExerciseDialog` share their field
state and input cleaning through `useExerciseForm` (`src/composables/exerciseForm.ts`) and the
`PerSideToggle` segmented control.

```
App.vue                 navbar + main column, --accent variable, .dark class, clock refresh,
│                       cross-tab sync
├── AppNavbar.vue       sticky top bar: app name, ‹ This Week ›, Edit plan switch, Settings, Print…
│   └── SettingsPopover.vue   theme (System/Light/Dark), accent swatches, exercises-per-day stepper,
│                             Export and Import… (see §4)
├── WeekHeader.vue      H1 week label, daily-pick hint, grand total; in config mode "Copy plan to
│                       next week" and a note when the plan is carried over
├── ExerciseGrid.vue    wires planner to a TrackerGrid: sets/reps/weight chips, edit, "Picked / N"
│   ├── TrackerGrid.vue CSS grid: header row, one TrackerRow per item, footer counts
│   │   └── TrackerRow.vue  name (+ optional chips), 7 × DayCell, total; in config mode also
│   │                       ✎ edit (if editable), × remove (confirms), goal NumberStepper
│   └── EditExerciseDialog.vue  native modal: name, sets, reps, PerSideToggle, weight
├── AddExerciseForm.vue config mode only: name, sets, reps, PerSideToggle, weight (kg)
└── DietSection.vue     "Diet" heading with goals met
    ├── TrackerGrid.vue wired to diet: no chips, neutral "Eaten" footer
    └── AddFoodForm.vue config mode only: name, Add Food
```

## 2. Weekly plans

Each week has its own **plan**: the exercises (with sets, reps, per-side, weight and goal) and the
foods (with goals). Ticks live in a separate **log**, keyed by week and item id.

- **Carry forward.** A week without a plan of its own shows the plan of the latest earlier week that
  has one (`planSource` in `src/lib/plans.ts`); weeks before the first plan show the earliest one,
  and with no plans at all the stores show the defaults. In config mode the header says which week
  the plan comes from, naming the exercise and food sources separately when they differ.
- **A week gets its own plan when it first changes**, ticks included: the store copies what the week
  shows into `plans[week]` and edits that copy (`own()`). Until then, an unplanned week follows its
  source, so changing this week's plan also changes the weeks ahead that haven't been touched.
- **Copy plan to next week** (config mode) copies the visible week's exercises and foods into the
  next week, replacing its plan after a confirmation if it had one, then shows that week.
- Items keep their ids when copied, so a week's ticks stay attached to the same exercise or food.
  Removing an item from one week leaves weeks with their own plan alone; its ticks stay in the log,
  uncounted.

## 3. Stores

`usePlannerStore` is a setup store.

| State                 | Persisted                      | Notes                                                           |
| --------------------- | ------------------------------ | --------------------------------------------------------------- |
| `plans`               | `exercise-planner-v2`          | week → `{ id, name, sets?, reps, perSide?, weight?, target }[]` |
| `log`                 | `exercise-planner-v2`          | week Monday `YYYY-MM-DD` → exercise id → seven booleans         |
| `accent`, `dailyPick` | `exercise-planner-settings-v1` | defaults `#30d158`, `3`                                         |
| `theme`               | `exercise-planner-settings-v1` | `system` (default), `light` or `dark`                           |
| `configMode`          | no                             | `false` (normal mode) on every load                             |
| `weekOffset`          | no                             | `0` is the current week                                         |
| `now`                 | no                             | a ref so "today" can move; see §5                               |

**Derived:** `monday`, `weekKey`, `currentWeekKey`, `nextWeekKey`, `label`, `days` (name, date, key,
`isToday`), `exercises` (the visible week's plan, see §2), `carriedFrom` (the source week, or null
when the week has its own plan), `nextWeekHasPlan`, `dayCounts`, `grandTotal`, and the helpers
`isDone(id, day)` and `totalFor(id)`. Totals count only the week's exercises, so a removed
exercise's history stays in `log` without inflating the numbers.

**Actions** (plan edits apply to the visible week only): `toggle`, `changeTarget` (clamps 0–7),
`addExercise` (returns `false` for an empty name; new exercises get goal 3), `updateExercise`
(replaces name, sets, reps, per-side and weight, keeping the id, goal and history; `false` for an
empty name or an id not in the week), `removeExercise`, `copyToNextWeek`, `setConfigMode`,
`prevWeek`, `nextWeek`, `thisWeek`, `refreshNow`, `syncFromStorage`, `setAccent`, `changeDailyPick`
(clamps 1–8), `setTheme`, `importData` (merges an export into the plans, log and settings; see §4)
and `savedSettings`. The module also exports `exerciseDetails`, which gives the chips under a name:
"3 × 10 reps" (or "10 reps / set" without sets, "3 sets" without reps, "8 each side" in place of
"10 reps" when per side), then "12 kg" when weighted, or "—" for none of these.

`useDietStore` holds `plans` of foods (`{ id, name, target }`) and its own `log`, persisted together
under `exercise-planner-diet-v2`. It reads `planner.weekKey`, so week navigation moves both
sections. It derives `foods`, `dayCounts`, `grandTotal`, `goalsMet` and `nextWeekHasPlan`, and
offers `isEaten`, `totalFor`, `toggle`, `changeTarget` (0–7), `addFood` (goal 3, `false` for an
empty name), `removeFood`, `copyToNextWeek`, `syncFromStorage` and `importData`. Food goals work
like exercise goals (met once the count reaches a non-zero goal); foods have no daily target.

Watchers persist state: a deep one per data payload and a shallow one for the settings. `writeKey`
skips the write when the stored string already matches, and swallows storage errors, so with storage
blocked or full the app keeps working in memory.

## 4. Storage format and validation

Exercise data is `{ plans, log }` under `exercise-planner-v2`, diet data the same shape under
`exercise-planner-diet-v2`, and settings `{ accent, dailyPick, theme }` under
`exercise-planner-settings-v1`. Browsers isolate storage per origin, so data does not move between
hosts.

**Migration.** Before weekly plans, one list served every week: `{ exercises, log }` under
`exercise-planner-v1` (the design prototype's key and shape) and `{ foods, log }` under
`exercise-planner-diet-v1`. When a v2 key is missing and its v1 key exists, the store converts it:
the list becomes the plan for every week in the log and for the current week, so every week looks as
it did, and the result is saved as v2 at once. The v1 keys are never written or deleted. A v2 value
that is not a JSON object also falls back to migrating v1 (or to the defaults without one); that
result is saved on the next change. A tab still running the pre-v2 app keeps writing v1, which the
new app no longer reads once v2 exists, so reload open tabs after updating.

`parsePlannerData` (`src/lib/storage.ts`) validates field by field:

- Plans whose week key is not `YYYY-MM-DD`, or whose value is not an array, drop out.
- Items without a string `id` and `name` drop out; `reps` rounds and floors at 0; `target` rounds
  and clamps to 0–7, defaulting to 3.
- `sets` is kept only as a whole number from 1 to 20 (larger values cap at 20); `weight` (kg) only
  as a positive number, rounded to 2 decimals and capped at 500. Otherwise the key is left out.
- Log weeks whose key is not `YYYY-MM-DD`, and entries that are not arrays, drop out; the rest
  normalise to exactly seven booleans.
- When migrating, a v1 payload that is not a JSON object, or whose list is not an array, yields the
  defaults; an empty list stays empty. The prototype trusted its stored data and crashed outright on
  a payload without `log`.

`parseDietData` applies the same rules to foods, with four default foods (Vegetables 7, Fruit 5,
Fish 2, Nuts 3).

`parseSettings` accepts any `#rrggbb` accent (not only the four swatches), clamps the daily pick to
1–8, and accepts only `system`, `light` or `dark` as the theme, falling back to the defaults
otherwise. Settings saved before the theme option existed load as `system`.

**Export and import.** Settings → Export downloads `exercise-planner-YYYY-MM-DD.json`:

```json
{
  "format": "exercise-planner-export",
  "version": 1,
  "exportedAt": "2026-10-24T09:30:00.000Z",
  "exercise": { "plans": {}, "log": {} },
  "diet": { "plans": {}, "log": {} },
  "settings": { "accent": "#30d158", "dailyPick": 3 }
}
```

The theme is not exported, because it belongs to the device rather than the person. Import… reads a
file through `parseExport` (`src/lib/transfer.ts`), which rejects anything that is not JSON, has
another `format`, or has a `version` other than 1. It validates the rest with the same normalisers
as storage, so a hand-edited file loads the way a hand-edited `localStorage` value would. Missing
`settings`, or settings that are not an object, mean "no settings".

An import **merges and never deletes** (`mergeTracked`, `mergeSettings`):

- A week that already has a plan keeps it; a week with no plan takes the file's.
- Ticks are OR-ed per week, item and day, so an import can add ticks but never clears one.
- The file's accent and daily pick apply only when this browser has no saved settings yet: none
  were stored when the app loaded, and none have been changed or imported since. Tracking this in
  the store rather than re-reading the key keeps it right when storage is blocked. An import that
  applies settings saves them, so a second import does not offer them again.

The confirm step names how many weeks and ticks the file adds (`mergeSummary`) before anything is
written. It is computed from the current state, so it stays right if another tab or a settings
change lands while it is open. Importing the same file twice adds nothing the second time. Adding a week can change what
an unplanned week carries forward from (§2). The import took its history from the file, so that is
the intended result.

`fixtures/transfer/` holds the parse and merge cases as JSON, each with its expected result.
`src/lib/__tests__/transfer.spec.ts` runs every case. The format is the contract for the API's
import and export as well, so the API's tests will run the same files.

## 5. Decisions beyond the design

- **Cells are buttons.** The prototype's cells were clickable `div`s. `DayCell` renders a `button`
  with `aria-pressed` and a label such as "Squats, Fri 23", so the grid works from the keyboard and
  with a screen reader. The grid carries ARIA `table`/`row`/`cell` roles.
- **A normal web page, not a window.** The handoff drew the app as a macOS window (traffic lights, a
  framed window on a backdrop). The app is an SPA, so it uses a full-width sticky navbar and a
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
- **Config mode and normal mode.** Normal mode, the default on every load, only ticks cells. The
  "Edit plan" switch in the navbar (a `role="switch"` button) turns on config mode, which shows ✎,
  ×, the goal steppers, the add forms and "Copy plan to next week". The mode is not saved, so the
  app always opens ready for ticking.
- **Exercises are editable.** The handoff had no way to change an exercise after adding it. A ✎
  button on each exercise row (not foods) opens `EditExerciseDialog`, a native `<dialog>` opened
  with `showModal()`, which traps focus, closes on Escape and returns focus to the button. Sets and
  weight are optional, weight in kg; the sets/reps chip and the weight chip are separate so they
  wrap in the narrow name column.
- **Steppers mark their bounds** (goal 0/7, daily pick 1/8) with `aria-disabled` and ignore the
  click there. `disabled` would drop keyboard focus mid-press. The store still clamps as a backstop.
- **Today refreshes.** A one-minute tick and `visibilitychange` both call `refreshNow`, which
  updates `now` only when the date has changed. A tab left open past midnight moves its highlighted
  column within a minute.
- **Export and import live in Settings.** Data is per browser, so the export file is the way to
  back it up or move it to another origin (the dev server's data has no other way out). Import is
  additive by design: restoring an old backup over newer data cannot lose the newer data.
- **Tabs stay in sync.** `App.vue` listens for `storage` events and calls both stores'
  `syncFromStorage`, so a stale tab adopts another tab's edits instead of overwriting them with its
  old state.
- **Diet sits below the exercises** on the same page, sharing the week navigation and the print
  sheet. It has no daily target, so its footer counts are neutral rather than accent/orange.
- **Print is black on white in either theme.** The print block in `src/styles/main.css` swaps the
  colour tokens for print values: off cells and the today column print white, and only done cells
  print black with a white tick. The navbar and every config-mode control are hidden
  (`data-noprint`), and each grid avoids splitting across pages.
- **Narrow screens.** Below 640px the navbar drops the app name and Print… and shortens the switch
  label to "Edit"; below 380px a gear replaces the word Settings (still its accessible name), so the
  controls fit a 320px screen. The grid scrolls sideways at its 780px minimum width, as designed.

## 6. Styling

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
- **Print.** The `@media print` block described in §5.
