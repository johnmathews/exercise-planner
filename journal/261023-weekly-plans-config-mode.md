# Weekly plans, copy to next week, config mode, sets

Requests, in John's words:

- "we need just one weight per exercise per week."
- "we need the ability to copy over a weeks configuration (exercises, weights, reps, food etc) to the
  next week."
- "we should have a config mode and normal mode (with a switch to toggle between the two). in config
  mode i can change weights, reps, sets, add/remove exercises and foods etc. and in 'normal' mode i
  just say which exercise i completed."

Asked what an unplanned week should show, John chose **auto-carry forward**.

PRs #3 (Tailwind, themes, navbar) and #4 (exercise weight, edit dialog) were merged first, as
asked. #4 was rebased onto `main` after #3's squash merge, so it carried only its own commit.

## What changed

- **Per-week plans.** Exercises and foods are no longer one list shared by every week. The data is
  `{ plans: { [week]: items[] }, log }` under the new keys `exercise-planner-v2` and
  `exercise-planner-diet-v2`. Weight, sets, reps and goals are therefore per week.
- **Carry forward** (`planSource`, `src/lib/plans.ts`). An unplanned week shows the latest earlier
  week's plan. It gets its own copy on its first change, and a tick counts as a change.
- **Copy plan to next week** copies both exercises and foods. It asks before replacing a next week
  that already has its own plan, then shows that week.
- **Config mode.** An "Edit plan" switch in the navbar. Normal mode (the default, and not saved)
  hides ✎, ×, the goal steppers, the add forms and the copy button, so only cells can be ticked.
- **Sets.** An optional sets count, 1–20, in the add form and the edit dialog. It shows as "3 × 10
  reps". The request listed sets among the things to edit, and the app didn't record them.
- **Migration.** v1 data (`{ exercises, log }`, `{ foods, log }`) becomes the plan for every logged
  week plus the current week, and is saved as v2 straight away. v1 keys are left untouched as a
  fallback.

## Decisions

- **Carry forward is lazy, not "copy on first view".** The option John picked was worded as an
  unplanned week starting as a copy the first time you view it. Freezing a week the moment you view
  it would make simply browsing ahead freeze next week, and a weight change made afterwards would
  then not reach it. So an unplanned week keeps following its source until something in that week
  changes. What you see is the same as described, and "Copy plan to next week" covers the case of
  pushing changes onto a week that already has its own plan.
- **Ids carry across weeks**, so copying keeps a week's existing ticks attached.
- **Normal mode on every load**, so the default screen can't be edited by accident. Ticking still
  works in config mode.
- **Phone width:** below 640px the navbar hides the app name and Print… and the switch reads
  "Edit"; below 380px Settings becomes a gear. Measured: no overflow at 390px or 320px.
- **Prototype byte-compatibility is gone** as a property of live data. Only the migration reads the
  prototype's format now; the docs and tests changed to match.

## Gotcha

`Object.hasOwn` on a Vue reactive object isn't tracked: the proxy trap it uses isn't one Vue
records. So `nextWeekHasPlan` never updated. `week in plans` is tracked, and `planSource` and both
stores use it.

## Review fixes

A fresh-eyes review found no high-severity bugs. I fixed:

- An edit dialog left open across midnight on Sunday would save into the new week. It now closes
  when the week changes.
- The carried-over note covered only exercises, although exercise and food plans become a week's
  own separately. It now reads "Uses the plan from …" and names each source when they differ. The
  neutral wording also covers weeks before the first plan, whose source is a later week.
- Sets inputs got `maxlength="2"`.
- Several doc claims were wrong: removal reaching untouched later weeks, chip wording, migration
  conditions.

Accepted and documented rather than fixed:

- A tab still running the pre-v2 app keeps writing v1, which is ignored once v2 exists. Reload open
  tabs after updating.
- An unreadable v2 value falls back to migrating v1.

## Verified

- 123 tests pass, and lint, type-check and format are clean.
- In Playwright: at 390px in dark normal mode the navbar fits and no editing controls show. At
  1280px in light config mode, all controls show.
- Seeded v1 data with a weight and a tick migrated correctly: the plan and log were written as v2,
  and the next week showed the carried-over note.
