# Development

> Purpose
>
> The toolchain, the scripts, the code conventions, and how the tests are organised.

## 1. Toolchain

- Node `^22.18.0 || >=24.12.0` (from `engines` in `package.json`). CI runs Node 22.
- **npm 11.** npm 10.9, which ships with Node 22, crashes during install with
  `Cannot read properties of null (reading 'edgesOut')` while resolving this dependency tree's peer
  sets. Install npm 11 first (`npm install -g npm@11`) or run it ad hoc with
  `npx -y npm@11 install`. CI and the Dockerfile both do the former.
- Vue 3.5, Pinia 4, Vite 8, Tailwind CSS 4, TypeScript 6, Vitest 4 with jsdom, ESLint 10 + oxlint,
  Prettier with `prettier-plugin-tailwindcss`.
- The API in `api/` uses Python 3.13 with uv, FastAPI, pytest with coverage, ruff and mypy
  (strict). [api.md](api.md) §10 has its commands. Its tests run the same `fixtures/transfer/` cases
  as Vitest, so a validation rule changed in `src/lib/storage.ts` must change in
  `api/src/exercise_planner_api/validate.py` too, and the reverse.

## 2. Scripts

| Script                            | Does                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                     | Vite dev server with Vue devtools                                  |
| `npm run build`                   | `type-check` and `build-only` in parallel; either failing fails it |
| `npm run build-only`              | `vite build` into `dist/` without type-checking (CI runs it last)  |
| `npm run preview`                 | serve `dist/`                                                      |
| `npm test`                        | run the Vitest suite once                                          |
| `npm run test:watch`              | Vitest in watch mode                                               |
| `npm run test:coverage`           | suite plus v8 coverage (per-file text table, HTML in `coverage/`)  |
| `npm run type-check`              | `vue-tsc --build` across the app, node and test configs            |
| `npm run lint`                    | `lint:oxlint` then `lint:eslint`, read-only (CI runs this)         |
| `npm run lint-fix`                | both linters with `--fix`                                          |
| `npm run format` / `format:check` | Prettier over `src/` and `fixtures/`                               |

The linters ignore `design_handoff_exercise_planner/`, which holds vendored prototype code.

## 3. Conventions

- Prettier (`.prettierrc.json`): no semicolons, single quotes, print width 100. The Tailwind plugin
  sorts class lists in templates; it reads the theme from `src/styles/main.css`. `.editorconfig`
  sets indentation for editors; `.vscode/extensions.json` recommends the Vue and lint extensions.
- `@/` resolves to `src/` in Vite (`vite.config.ts`) and TypeScript (`tsconfig.app.json`).
- Components use `<script setup lang="ts">` and Tailwind utility classes, with no `<style>` blocks.
  Use the semantic colours (`bg-surface`, `text-muted`, `border-line`, …) from
  `src/styles/main.css` rather than palette colours, so both themes work; a class list used more
  than once in a component goes in a constant in its script.
- Tests find elements by role, label, `data-testid` or state attributes (`data-today`, `data-tone`,
  `data-met`, `data-on`, `aria-pressed`), never by styling classes.

## 4. Tests

Tests sit in `__tests__/` next to the code they cover:

- `src/lib/__tests__/dates.spec.ts`: Monday maths, offsets, year boundary, the 2026-10-25 week (a
  DST change in EU timezones), labels.
- `src/lib/__tests__/storage.spec.ts`: v2 plan validation and round-trip, migration from the v1
  (prototype) format, log normalisation, sets and weight, diet parsing, settings parsing,
  skip-unchanged writes, storage that throws.
- `src/lib/__tests__/plans.spec.ts`: which week's plan a week shows (own, carried forward, earliest,
  none) and plan copies.
- `src/composables/__tests__/exerciseForm.spec.ts`: digits-only sets/reps and decimal weight
  cleaning, loading and resetting the shared exercise form.
- `src/lib/__tests__/transfer.spec.ts`: every case in `fixtures/transfer/` (parsing an export and
  merging one), plus building an export, the merge summary and the download. Add a fixture rather
  than an inline case when the behaviour is part of the export contract, since the API's tests will
  read the same files.
- `fixtures/transfer/sample/`: `storage.json` is a realistic `localStorage` snapshot. It spans five
  weeks (2026-09-21 to 2026-10-19): four with data, and 2026-09-28 left empty so it carries the
  plan before it forward. It has plans edited over time (sets, weights, Back extensions removed,
  Plank added), 102 ticks, a diet with an added food, and non-default settings. `export.json` is
  the export it must produce. `App.spec.ts` seeds the snapshot and checks Export gives
  `export.json`. It also imports `export.json` into an empty browser and checks the snapshot comes
  back, with the theme left at the device's own default. To see the app populated while
  developing, import `fixtures/transfer/sample/export.json` from Settings → Import… on a scratch
  origin. Tests read fixtures through `src/lib/__tests__/fixtures.ts`.
- `src/lib/__tests__/tracker.spec.ts`: the shared tick-per-day helpers (totals, day counts, goals
  met, toggling, ids).
- `src/lib/__tests__/theme.spec.ts`: theme names and how System, Light and Dark resolve.
- `src/stores/__tests__/planner.spec.ts`: toggling, totals, week navigation, goal clamping, adding,
  removal's effect on totals, persistence and v1 migration, settings, detail chips, editing
  exercises, sets, weekly plans (defaults, carry forward, a week getting its own plan, copying to
  the next week), config mode, the midnight refresh, `syncFromStorage`, and `importData` (merging,
  and settings applying only when none are saved).
- `src/stores/__tests__/diet.spec.ts`: food toggling in the planner's week, persistence under the
  diet key only, shared week navigation, goal clamping, add/remove, cross-tab sync, carrying and
  copying food plans, v1 migration, `importData`.
- `src/components/__tests__/App.spec.ts`: the mounted app in jsdom. Covers rendering, the today
  column, cell toggling and `aria-pressed`, footer colours, the goal stepper and its bounds,
  navigation, confirm-before-remove, print, the visibility and one-minute clock refresh, cross-tab
  `storage` events, the add form, the settings popover including focus return, and the theme: the
  `dark` class following the OS (with a stubbed `matchMedia`), the theme buttons and their
  persistence. Also the weight and sets fields, the edit dialog (with `showModal`/`close` stubbed,
  as jsdom has no modal dialogs), normal mode hiding every editing control, export (with
  `URL.createObjectURL` stubbed) and import through the file input (summary, confirm, cancel,
  errors), copying the plan to
  the next week (with and without the replace confirmation), and the carried-over note. Tests that
  edit the plan mount with `mountConfig()`, which turns config mode on. Queries that would also
  match the diet grid scope to `[data-testid="exercise-grid"]`; the rest rely on exercise-only
  labels or on the exercise form coming first in the DOM.
- `src/components/__tests__/DietSection.spec.ts`: the diet section in the mounted app: default
  foods, ticking, footer and goals-met counts, shared week navigation, add/remove and the goal
  stepper (in config mode), cross-tab sync.

`vitest.config.ts` sets coverage thresholds (100% lines and functions, 99% statements, 98%
branches), so `npm run test:coverage` and CI fail when coverage drops below them.

Every test that depends on the date pins the clock with `vi.useFakeTimers({ toFake: ['Date'] })`
(the minute-tick test also fakes `setInterval`), and all tests build dates with local-time
constructors, so they pass in any timezone. No end-to-end browser tests run in CI.
