# Handoff: Weekly Exercise Planner (Vue SPA)

## Overview
A weekly workout log. Rows = exercises, columns = Mon–Sun. Each day the user picks ~3 exercises and clicks the cell to mark it done. The last column counts how many times each exercise was done this week vs. a per-exercise weekly goal (in days). Past weeks are kept and navigable. A print view produces a clean black-on-white sheet.

## About the Design Files
`Exercise Planner v2.dc.html` is a **design reference built in HTML** — a working prototype showing look and behavior, not production code. Recreate it as a **Vue 3 SPA** (recommended: Vite + Vue 3 `<script setup>` + Pinia or a simple composable for state; no UI library needed). Open the HTML file in a browser to see it live. The logic class at the bottom of the file (`class Component …`) contains all behavior and is a good reference for the store.

## Fidelity
**High-fidelity.** Match colors, type, spacing, and radii below exactly.

## Screen: Week view (single screen)

### Layout
- Page background: `radial-gradient(1200px 600px at 50% -10%, #26262a, #0f0f10)`, padding 40px 24px 64px.
- Centered "window": max-width 1120px, bg `#1c1c1e`, border 1px `#3a3a3c`, radius 12px, shadow `0 30px 80px rgba(0,0,0,.55), 0 0 0 .5px rgba(0,0,0,.8)`, overflow hidden.

### 1. Title bar (toolbar)
- bg `#2c2c2e`, border-bottom 1px `#000`, padding 10px 14px, flex row, gap 12px, wraps.
- Traffic lights (decorative): three 12px circles, gap 8px — `#ff5f57`, `#febc2e`, `#28c840`. (Optional in a real website — drop if it feels fake.)
- Title "Workout Log" 13px/600, letter-spacing -.01em; below it week label 11px `#98989d`.
- Right: segmented control (bg `#1c1c1e`, border `#3a3a3c`, radius 7px, padding 2px, gap 2px) with `‹`, `This Week`, `›` buttons (height 24px, radius 5px, 12–13px/500; "This Week" bg `#3a3a3c`; hover `#3a3a3c`/`#48484a`). Then "Print…" button: height 28px, padding 0 12px, bg+border `#3a3a3c`, radius 7px, 12px/500, hover `#48484a`. All buttons `white-space: nowrap`.

### 2. Heading row
- padding 28px 28px 8px; flex space-between, wraps.
- H1 = week label, e.g. "Oct 19 – Oct 25, 2026": 30px/700, letter-spacing -.025em.
- Sub: "Pick {dailyPick} exercises a day. Click a cell when it’s done." 13px `#98989d`.
- Right: grand total in mono 30px/600 in accent color + "sessions this week" 13px `#98989d`.

### 3. Grid (the planner)
- Wrapper padding 16px 28px 0, `overflow-x: auto`; grid min-width 780px.
- `grid-template-columns: minmax(220px,1.7fr) repeat(7, minmax(64px,1fr)) minmax(124px,.9fr)`.
- Container: border 1px `#3a3a3c`, radius 10px, bg `#232325`.
- **Header row** (bg `#2a2a2c`, border-bottom `#3a3a3c`):
  - "EXERCISE" / "WEEK" labels: 11px/600, uppercase, letter-spacing .06em, `#98989d`.
  - Day cells: name ("Mon") 12px/600 + date ("19") mono 11px `#98989d`. Today's column: bg `#323236`, name and date in accent.
- **Exercise rows** (border-bottom `#333336`, column dividers `#333336`; divider before Week column `#48484a`):
  - Name cell: padding 10px 10px 10px 16px, min-height 44px. Name 14px/600. Below, a chip: mono 11px `#98989d`, bg `#2c2c2e`, border `#3a3a3c`, radius 4px, padding 1px 6px. Text: `"{reps} reps / set"` or `"{reps} each side / set"` (or "—" if no reps). Remove button "×" 24px, `#636366`, hover bg `#3a3a3c`, confirms before deleting.
  - Day cells: padding 6px; today's column bg `#2a2a2e`. Inner box radius 6px, min-height 38px.
    - Off: bg `#1c1c1e`, border `#3a3a3c`, shadow `inset 0 1px 2px rgba(0,0,0,.4)`.
    - On: bg + border = accent, white "✓" 15px/700, shadow `inset 0 1px 0 rgba(255,255,255,.25)`.
    - Whole cell is clickable, toggles.
  - Week cell: total in mono 20px/600 (accent if total ≥ goal and goal > 0, else `#f5f5f7`) + " / {goal}" 12px `#636366`, nowrap. Below, a −/+ stepper (bg `#1c1c1e`, border `#3a3a3c`, radius 5px, buttons 24×20, 1px divider) — goal clamps 0–7.
- **Footer row** (bg `#2a2a2c`): "PICKED / 3" label; per-day count mono 13px/600 as `"{n}/3"` — color accent when n == dailyPick, `#ff9f0a` when over, `#636366` when under. Last cell = grand total.

### 4. Add-exercise form
- padding 20px 28px 28px, flex wrap, gap 8px.
- Name input (flex 1 1 220px) and Reps input (70px, digits only): height 32px, bg `#2c2c2e`, border `#3a3a3c`, radius 7px, 13px; focus border `#0a84ff` + ring `0 0 0 3px rgba(10,132,255,.35)`. Placeholder `#636366`.
- Segmented toggle "per set" | "each side, per set" (selected: bg `#48484a`, text `#f5f5f7`; unselected: transparent, `#98989d`).
- "Add Exercise" button: height 32px, bg `#0a84ff`, white 13px/600, radius 7px, hover `#409cff`. Enter submits. Empty name = no-op. New exercises get goal 3.

## Interactions & Behavior
- Week = Monday–Sunday. Prev/Next shift by 7 days; "This Week" resets.
- Click a day cell → toggle done for that exercise/day/week.
- Goal −/+ → change weekly target (days), 0–7.
- × → confirm, then delete exercise (its log history can remain in storage).
- Print → `window.print()`. Print CSS: landscape, 12mm margin; white background, all text black, borders `#ccc`, done cells black with white ✓; hide toolbar controls, steppers, remove buttons, form, traffic lights.
- No animations in the prototype; a 120ms background-color transition on cells is fine.

## State Management
```ts
type Exercise = { id: string; name: string; reps: number; perSide?: boolean; target: number };
type Log = Record<string /* week Monday 'YYYY-MM-DD' */, Record<string /* exerciseId */, boolean[] /* length 7 */>>;
state: { exercises: Exercise[]; log: Log; weekOffset: number; dailyPick: number /* default 3 */; accent: string }
```
- Derived: week dates, today index, per-row total (`count(true)`), per-day picked count, grand total.
- Persist `{ exercises, log }` to `localStorage` key `exercise-planner-v1` (same shape as the prototype, so existing data carries over if served on the same origin — it won't across origins). A backend/sync is a future option.
- Default exercises: Push-ups 10/set (goal 4), Pull-ups 3/set (4), Squats 15/set (4), Back extensions 12/set (3), Kettlebell halos 8 each side/set (3).

## Design Tokens
- Colors: bg-page `#0f0f10`, window `#1c1c1e`, grid `#232325`, header/footer `#2a2a2c`, toolbar/input `#2c2c2e`, today-head `#323236`, today-col `#2a2a2e`, border `#3a3a3c`, border-subtle `#333336`, border-strong `#48484a`, text `#f5f5f7`, text-2 `#98989d`, text-3 `#636366`, warn `#ff9f0a`.
- Accent (user setting): `#0a84ff` default; options `#30d158` (user's current pick), `#ff9f0a`, `#bf5af2`.
- Type: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`; numbers `'SF Mono', ui-monospace, Menlo, monospace`. Sizes 11/12/13/14/15/20/30.
- Radii: 4, 5, 6, 7, 10, 12. Spacing: 2, 4, 6, 8, 10, 12, 16, 20, 28.

## Assets
None — no images or icon files. Glyphs used: ‹ › × − + ✓.

## Files
- `Exercise Planner v2.dc.html` — the design reference (open in a browser).

## Suggested Vue structure
`App.vue` → `TitleBar.vue`, `WeekHeader.vue`, `PlannerGrid.vue` (`ExerciseRow.vue`, `DayCell.vue`, `GoalStepper.vue`), `AddExerciseForm.vue`; `stores/planner.ts` (Pinia) with persistence; `print.css`.
