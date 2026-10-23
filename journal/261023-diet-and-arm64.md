# 2026-10-23 — Diet tracker, arm64 image, README deploy guide

> Purpose
>
> Records the second change set of the day: a diet section, a multi-architecture image, and the
> README's getting-started and deploy sections.

## 1. Decisions

- **Diet shape (user's choice):** a tick per day against a weekly goal, below the exercise grid,
  aim-for goals only. Rejected: servings counts, free-text logging, tabs, and "limit" goals.
- **Default foods:** Vegetables 7, Fruit 5, Fish 2, Nuts 3. These are a starting point picked
  for this build, not something the user specified; every food is removable.
- **Separate storage key** (`exercise-planner-diet-v1`): adding foods to `exercise-planner-v1`
  would break its byte-compatibility with the design prototype.
- **One grid, two sections:** the tick-per-day logic moved into pure helpers
  (`src/lib/tracker.ts`), and `PlannerGrid`/`ExerciseRow` became props-driven
  `TrackerGrid`/`TrackerRow`. A copied grid would have doubled every future fix.
- **arm64 without QEMU:** the build stage runs on `$BUILDPLATFORM` because its output is
  architecture-independent static files. Only the nginx stage is assembled per platform, and it
  only copies files.

## 2. Verification

- 75 tests pass (54 before, plus tracker, diet storage, diet store and diet UI tests); the
  existing exercise tests pass unchanged apart from scoping queries to the exercise grid.
  Confirmed.
- A local `buildx` run built both `linux/amd64` and `linux/arm64`, with the build stage running
  once. Confirmed. CI publishing the multi-arch manifest is checked after merge, not here.
- In a browser, the diet section rendered below the exercises, ticks updated the totals and
  goals met, and print emulation produced a black-on-white sheet with both grids. Confirmed.
- The README's Compose snippet passes `docker compose config`. Confirmed.

## 3. Review round

The code review found no defects; its optional suggestion to stop a grid splitting across printed
pages was taken (`break-inside: avoid`). The docs audit found 15 minor issues, all fixed except
the "Workout Log" title versus "workout and diet log" wording, which is left as a naming choice.

## 4. What is deliberately not done

- **No limit goals** ("at most N days", e.g. alcohol): the user chose aim-for only.
- **No provenance opt-out** on the multi-arch push: the attestation entries GHCR lists as
  `unknown/unknown` are supply-chain metadata, not clutter.
- **No rename of the app title.** "Workout Log" comes from the design; changing it is the
  user's call.
