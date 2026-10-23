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
- Vue 3.5, Pinia 4, Vite 8, TypeScript 6, Vitest 4 with jsdom, ESLint 10 + oxlint, Prettier.

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
| `npm run format` / `format:check` | Prettier over `src/`                                               |

The linters ignore `design_handoff_exercise_planner/`, which holds vendored prototype code.

## 3. Conventions

- Prettier (`.prettierrc.json`): no semicolons, single quotes, print width 100. `.editorconfig` sets
  indentation for editors; `.vscode/extensions.json` recommends the Vue and lint extensions.
- `@/` resolves to `src/` in Vite (`vite.config.ts`) and TypeScript (`tsconfig.app.json`).
- Components use `<script setup lang="ts">` and scoped styles that read tokens from
  `src/styles/tokens.css`; colours do not appear as literals except where the design fixes them.

## 4. Tests

Tests sit in `__tests__/` next to the code they cover:

- `src/lib/__tests__/dates.spec.ts`: Monday maths, offsets, year boundary, the 2026-10-25 week (a
  DST change in EU timezones), labels.
- `src/lib/__tests__/storage.spec.ts`: payload validation, a byte-exact prototype round-trip, diet
  parsing, settings parsing, skip-unchanged writes, storage that throws.
- `src/lib/__tests__/tracker.spec.ts`: the shared tick-per-day helpers (totals, day counts, goals
  met, toggling, ids).
- `src/stores/__tests__/planner.spec.ts`: toggling, totals, week navigation, goal clamping, adding,
  removal's effect on totals, persistence, settings, reps labels, the midnight refresh, and
  `syncFromStorage`.
- `src/stores/__tests__/diet.spec.ts`: food toggling in the planner's week, persistence under the
  diet key only, shared week navigation, goal clamping, add/remove, cross-tab sync.
- `src/components/__tests__/App.spec.ts`: the mounted app in jsdom. Covers rendering, the today
  column, cell toggling and `aria-pressed`, footer colours, the goal stepper and its bounds,
  navigation, confirm-before-remove, print, the visibility and one-minute clock refresh, cross-tab
  `storage` events, the add form, and the settings popover including focus return. Queries that
  would also match the diet grid scope to `[data-testid="exercise-grid"]`; the rest rely on
  exercise-only labels or on the exercise form coming first in the DOM.
- `src/components/__tests__/DietSection.spec.ts`: the diet section in the mounted app: default
  foods, ticking, footer and goals-met counts, shared week navigation, add/remove, goal stepper,
  cross-tab sync.

Every test that depends on the date pins the clock with `vi.useFakeTimers({ toFake: ['Date'] })`
(the minute-tick test also fakes `setInterval`), and all tests build dates with local-time
constructors, so they pass in any timezone. No end-to-end browser tests run in CI.
