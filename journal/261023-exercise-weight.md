# Exercise weight and editing

John asked to record weight on some exercises, e.g. "squats with a 12kg kettlebell". Built on top
of the Tailwind branch (PR #3), which hadn't been merged yet.

## What changed

- `Exercise` gains an optional `weight` in kg. It shows as its own chip next to the reps chip
  ("15 reps / set", "12 kg").
- The add form has an optional "Weight kg" field.
- Existing exercises can now be edited. Before this there was no way to change one after adding it,
  so there was no way to give the default Squats a weight. A ✎ button on each exercise row opens
  `EditExerciseDialog` (name, reps, per set or each side, weight). Foods get no edit button; a food
  has only a name and a goal.
- `useExerciseForm` (`src/composables/exerciseForm.ts`) and `PerSideToggle.vue` hold the field
  state, input cleaning and segmented control that both forms share.
- Store: `updateExercise(id, input)` replaces the fields but keeps the id, goal and log history.
  `repsLabel` became `exerciseDetails`, which returns a list of chips.

## Decisions

- **Weight is a property of the exercise, not logged per day.** "Squats with a 12kg kettlebell"
  reads as what the exercise is. Logging a weight each day (to track progression) would mean a new
  log shape and a cell editor; that's left until it's asked for.
- **kg only**, rounded to 2 decimals, capped at 500, and positive or absent. A comma is accepted as
  the decimal point ("2,5"). `weight` is written only when set (unlike `perSide`, which add and edit
  always write), so prototype data still round-trips byte for byte. Rounding happens before the
  sign check, so a tiny value can't be stored as 0.
- **The dialog closes if another tab deletes its exercise**, instead of leaving a Save that can't
  apply. A name of only spaces fails the field's validation instead of silently not saving.
- **Native `<dialog>` with `showModal()`.** The browser handles focus trapping, Escape and returning
  focus to the button. jsdom has no `showModal`, so the component tests stub it.
- **Separate chips** because one "15 reps / set · 12 kg" chip ran under the edit button in the
  220px name column at phone width; separate chips wrap.

## Verified

- 98 tests pass (16 new). Lint, type-check and format are clean.
- In Playwright (dark, 1280px): ✎ Squats opens the dialog; typing 12 and pressing Enter saves it, so
  the chip shows "12 kg" and storage has `"weight":12`. Escape closes the dialog and focus returns
  to the ✎ button.
- At 390px in light mode, the chips wrap under the name and the add form wraps without horizontal
  scroll.
