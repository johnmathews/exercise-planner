# Architecture

> Purpose
>
> How the planner is put together: the component tree, the Pinia stores, how data syncs with the
> API and what stays in `localStorage`, and the decisions that depart from the design prototype.

## 1. Overview

A Vue 3 SPA with accounts. The API service in `api/` ([api.md](api.md)) holds each user's data, and
the app syncs with it through the same origin (§7). Two Pinia stores hold what the app shows:
`planner` (exercise plans, the log, the visible week, settings, the mode) and `diet` (food plans and
their log), which takes its week from `planner`. Two more run the account: `session` (who is signed
in) and `sync` (the per-user cache, the outbox of unsent writes, and reads). Both data stores track
the same thing, a tick
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
App.vue                 picks the screen (link, planner or sign-in), --accent variable, .dark class,
│                       clock refresh, sync triggers (focus, visibility, online, minute tick, storage)
├── PasswordForm.vue    an invite or reset link (#/invite/<t>, #/reset/<t>): choose a password
├── LoginForm.vue       username and password; explains refusals; notes an ended session
│   (both inside AuthCard.vue: a centred card with the app name)
├── AppNavbar.vue       sticky top bar: app name, ‹ This Week ›, Edit plan switch, Settings, Print…
│   └── SettingsPopover.vue   who is signed in and Sign out, theme (System/Light/Dark), accent
│                             swatches, exercises-per-day stepper, Export and Import… (see §4)
├── SyncStatus.vue      loading, offline and conflict messages above the planner
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

| State                 | Kept by                                     | Notes                                                           |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `plans`               | the sync store: server and per-user cache   | week → `{ id, name, sets?, reps, perSide?, weight?, target }[]` |
| `log`                 | the sync store: server and per-user cache   | week Monday `YYYY-MM-DD` → exercise id → seven booleans         |
| `accent`, `dailyPick` | the sync store: server and per-user cache   | defaults `#30d158`, `3`                                         |
| `theme`               | `exercise-planner-settings-v1` (the device) | `system` (default), `light` or `dark`                           |
| `configMode`          | no                                          | `false` (normal mode) on every load                             |
| `weekOffset`          | no                                          | `0` is the current week                                         |
| `now`                 | no                                          | a ref so "today" can move; see §5                               |

The stores start empty (showing the defaults) and never write the user's data themselves. The sync
store fills them with `adopt` and saves their changes (§7).

**Derived:** `monday`, `weekKey`, `currentWeekKey`, `nextWeekKey`, `label`, `days` (name, date, key,
`isToday`), `exercises` (the visible week's plan, see §2), `carriedFrom` (the source week, or null
when the week has its own plan), `nextWeekHasPlan`, `dayCounts`, `grandTotal`, and the helpers
`isDone(id, day)` and `totalFor(id)`. Totals count only the week's exercises, so a removed
exercise's history stays in `log` without inflating the numbers.

**Actions** (plan edits apply to the visible week only): `toggle`, `changeTarget` (clamps 0–7),
`addExercise` (returns `false` for an empty name; new exercises get goal 3), `updateExercise`
(replaces name, sets, reps, per-side and weight, keeping the id, goal and history; `false` for an
empty name or an id not in the week), `removeExercise`, `copyToNextWeek`, `setConfigMode`,
`prevWeek`, `nextWeek`, `thisWeek`, `refreshNow`, `setAccent`, `changeDailyPick` (clamps 1–8),
`setTheme`, `savedSettings` (the accent and daily pick, or null while the user has none of their own), `adopt`
(replace the data and settings wholesale), `adoptWeek` (replace one week's plan) and `clear` (forget
the user on sign-out, keeping the theme). The module also exports `exerciseDetails`, which gives the chips under a name:
"3 × 10 reps" (or "10 reps / set" without sets, "3 sets" without reps, "8 each side" in place of
"10 reps" when per side), then "12 kg" when weighted, or "—" for none of these.

`useDietStore` holds `plans` of foods (`{ id, name, target }`) and its own `log`, kept by the sync
store like the planner's. It reads `planner.weekKey`, so week navigation moves both
sections. It derives `foods`, `dayCounts`, `grandTotal`, `goalsMet` and `nextWeekHasPlan`, and
offers `isEaten`, `totalFor`, `toggle`, `changeTarget` (0–7), `addFood` (goal 3, `false` for an
empty name), `removeFood`, `copyToNextWeek`, `adopt`, `adoptWeek` and `clear`. Food goals work
like exercise goals (met once the count reaches a non-zero goal); foods have no daily target.

The planner writes only the theme, merged into whatever `exercise-planner-settings-v1` already holds.
`writeKey` skips the write when the stored string already matches, and swallows storage errors, so
with storage blocked or full the app keeps working in memory.

## 4. Storage format and validation

| Key                                 | Holds                                                        | Written |
| ----------------------------------- | ------------------------------------------------------------ | ------- |
| `exercise-planner-session-v1`       | `{ user }`: the last signed-in user                          | yes     |
| `exercise-planner-cache-v1:<user>`  | the user's state as `GET /api/state` returns it, with `revs` | yes     |
| `exercise-planner-outbox-v1:<user>` | writes not yet sent (§7)                                     | yes     |
| `exercise-planner-settings-v1`      | `theme`, read before first paint by `public/theme-init.js`   | theme   |
| `exercise-planner-v2`, `-diet-v2`   | exercise and food `{ plans, log }` from before accounts      | never   |
| `exercise-planner-v1`, `-diet-v1`   | the single-list format from before weekly plans              | never   |

Since accounts, nothing writes the keys from before them. They stay because they hold what a browser
recorded locally, which the first-login import (§7) reads with the parsing, migration and
validation below (`readLegacyData`, `src/lib/legacy.ts`). Signing out does not remove them. Browsers isolate storage per origin, so a cache belongs to
one origin and one user.

**Migration.** Before weekly plans, one list served every week: `{ exercises, log }` under
`exercise-planner-v1` (the design prototype's key and shape) and `{ foods, log }` under
`exercise-planner-diet-v1`. When a v2 key is missing and its v1 key exists, `parsePlannerData` and
`parseDietData` convert it: the list becomes the plan for every week in the log and for the current
week, so every week looks as it did. A v2 value that is not a JSON object also falls back to
migrating v1 (or to nothing without one). Before accounts, the stores saved the converted result as
v2; now the conversion only feeds the import.

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

An import **merges and never deletes** (`mergeTracked`, `mergeSettings`; the API's `import_data`
applies the same rules):

- A week that already has a plan keeps it; a week with no plan takes the file's.
- Ticks are OR-ed per week, item and day, so an import can add ticks but never clears one.
- The file's accent and daily pick apply only when the account has no settings of their own yet.

Confirming sends the file to `POST /api/import` (`sync.importFile`): the server merges it against
the account's real state in one transaction, and the app then reads the account afresh (after any
read already in flight, which predates the import). Local writes still queued go out first, so the
server merges against everything this device has; if they cannot be sent, nothing is imported. When
the import cannot be done, the popover says why (offline, a server failure, an ended session) and
keeps the file ready to try again. The confirm step names how many weeks and ticks the file adds
(`mergeSummary`, through `useImportSummary`, which the first-login prompt shares) before anything
is written. It is computed from the current state, so it stays right if another tab or a settings
change lands while it is open. Importing the same file twice adds nothing the second time. Adding a week can change what
an unplanned week carries forward from (§2). The import took its history from the file, so that is
the intended result.

`fixtures/transfer/` holds the parse and merge cases as JSON, each with its expected result.
`src/lib/__tests__/transfer.spec.ts` runs every case. The format is the contract for the API's
import and export as well: the API's tests (`api/tests/test_parity.py`) run the same files.

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
- **Export and import live in Settings.** Before accounts, data lived in one browser and the export
  file was the only way to move it or back it up. It is still each person's own copy of their data.
  Import is additive by design: restoring an old backup over newer data cannot lose the newer
  data.
- **Tabs stay in sync** through `storage` events on the user's cache key: a tab adopts another tab's
  state instead of overwriting it, and their writes share one outbox (§7). The plan had proposed a
  `BroadcastChannel`; the cache already lives in `localStorage`, whose events carry the same news
  with no second channel to keep in step.
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

## 7. Accounts and sync

**Signing in.** `session.init()` runs before the first render. A user remembered in
`exercise-planner-session-v1` is signed in at once and their cache shown, then `GET /api/auth/me`
confirms it. A 401 asks them to sign in again, keeping unsent writes; being offline keeps them
working from the cache. With nobody remembered the app waits for the server, then shows the
sign-in form. Invite and reset links arrive as `#/invite/<token>` and `#/reset/<token>`. The token
goes to the API in request bodies only, and the fragment is cleared once the link is used or turns
out to be invalid; offline or busy, the page offers to try again. Signing out ends the server
session, then deletes the user's cache and outbox from the device. It is refused while offline: the
cookie is HttpOnly, so only the server can end it.

**One user per tab, always.** Every read and write sends `X-Expected-User` with the user the tab
shows, and the API refuses any other with 401 (`api.md` §3). A tab left open as one person can then
never read or write the account of someone who signed in afterwards in another tab: the cookie is
shared, the name is not. The session store also follows `storage` events on the session key, so
when another tab signs out or in as someone else, this tab stops syncing, clears the stores, and
follows. Every request gives up after 15 seconds and counts as offline, so one dead connection
cannot stall syncing; replies that arrive after a sign-out or a user switch are ignored.

**Writes.** The stores change state at once. A deep watcher in the sync store diffs their state
against `base`, the state the server is known to hold, and turns each difference into an operation
in the outbox:

- `plan`: a week's plan, sent as `PUT /api/plans/<section>/<week>` with the revision last seen;
- `tick`: one day of one item, `PUT /api/ticks/…`, so devices ticking different days never collide;
- `settings`: the accent and daily pick.

A newer operation for the same plan, cell or settings replaces a queued one. Each carries an id, so
the reply to one already in flight removes only that one. Plan and settings operations read their
values when sent, so the server always gets the latest. Operations go out one at a time, in order.
A tick on a week with no plan of its own creates the plan first, as on the device.

| Reply                                               | What happens                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| success                                             | dequeued; a plan's new revision is stored                                              |
| 409 with the server copy                            | that week shows the server's plan, with a notice                                       |
| 409 with no server plan                             | sent again as a create                                                                 |
| offline, a timeout, or a 5xx with no API error code | kept; retried after 5 s, doubling to 60 s, and at once when the browser is back online |
| 401                                                 | kept; the sign-in form appears, and sending resumes after signing in                   |
| any other refusal                                   | dropped, so one bad write cannot block the rest, with a notice that it was undone      |

Two devices creating the same week from the same carried plan send identical items, which the API
accepts without a conflict (P7), so the common case raises no notice.

**Reads.** `GET /api/state` runs at start, on focus, on returning to a visible tab, and every minute
while visible. It replaces local state only when the outbox is empty, and only if nothing changed
locally while the read was in flight. A read first diffs the stores against `base` itself, because
Vue runs the watcher after a reply can already have landed. Without that, an edit made in the same
tick as the reply would be overwritten before it was ever queued. A refresh therefore never undoes
an edit that has not reached the server.

**The cache** holds the last state the stores showed, with each plan's revision, so a reload or a
cold start offline shows data at once. It is written on every change and every read. Another tab's
write to it arrives as a `storage` event, and this tab adopts it as both its state and its `base`:
that tab's own writes are already in the shared outbox. Adopting it also counts as a local change,
so a read this tab already had in flight cannot overwrite it. The cache is validated with the
storage normalisers when read, and outbox entries one by one, so a damaged key cannot break the app
or stick the outbox. A plan write for a week the stores no longer hold is dropped rather than sent
as an empty plan.

`SyncStatus` shows "Loading your data…" before the first state arrives. Offline, it shows a retry
button and how many changes are waiting. Conflict and refused-write notices stay until dismissed.
It sits in a live region that is always present, so screen readers announce each message.

**The first-login import.** Before accounts, each browser kept its own log under the keys in §4.
After sign-in, once the app has read the account from the server in this session (`sync.fresh`; a
cached copy could be stale), `ImportPrompt` reads those keys (`readLegacyData`). If they hold
anything the account lacks, it offers to add it, naming what it would add:

- **Add to my account** sends it through `importFile`, the same server merge as a file import, so
  nothing in the account is replaced or deleted.
- **Not mine** remembers the answer for this user on this browser.
- **Later** asks again on the next load.

The answer is kept in `exercise-planner-import-v1:<user>` (`imported` or `dismissed`), which signing
out leaves in place. If the account already holds everything the keys do (imported from another
device, say), the prompt records `imported` and never appears. Only an accent or daily pick in the
settings key counts as data: every device still writes its theme there. The old keys are never
changed, so a browser shared by two people offers its log to each until each answers.

The single-list format (v1) needs trimming first. The old app copied its one list onto every
logged week and onto the current week, so the screen looked as before. Imported into an account,
that copy on the current week would replace the account's own carried-forward plan for this week
and later ones, and an empty list would empty them. So the import puts the list only on the weeks
it was ticked in (on the current week only if it was never ticked), adds no plan for an empty list,
and reads a damaged v1 key as nothing rather than as the default exercises.

**Accepted limits.**

- Tabs share one outbox through `localStorage`, which Chrome copies between tab processes
  asynchronously. Two tabs of one user editing within that delay can each rewrite the outbox from
  a stale copy and lose the other's queued write. Duplicate sends are harmless (ticks carry their
  value, identical plans are accepted); this narrower case would need one outbox per tab.
- When a session ends by itself (expiry, a reset elsewhere), the device keeps that user's cache and
  outbox so unsent changes survive, and the sign-in form offers their username. Only signing out
  on purpose clears the device.
