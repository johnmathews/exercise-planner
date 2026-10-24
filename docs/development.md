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
- Running the app needs the API: the README's Getting started shows how. `npm run dev` forwards
  `/api` to `http://127.0.0.1:8000` (`API_URL` overrides it), so the browser sees one origin as it
  does behind nginx. `scripts/compose-smoke.sh` runs both images together and checks them through
  nginx.
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
  than an inline case when the behaviour is part of the export contract: the API's tests
  (`api/tests/test_parity.py`) read the same files.
- `fixtures/transfer/sample/`: `storage.json` is a realistic `localStorage` snapshot. It spans five
  weeks (2026-09-21 to 2026-10-19): four with data, and 2026-09-28 left empty so it carries the
  plan before it forward. It has plans edited over time (sets, weights, Back extensions removed,
  Plank added), 102 ticks, a diet with an added food, and non-default settings. `export.json` is
  the export it must produce. `App.spec.ts` seeds the snapshot and checks Export gives
  `export.json`. It also imports `export.json` into an empty account and checks the cache and the
  (fake) server both end up holding the sample, with the theme left on the device. To see the app populated while
  developing, import `fixtures/transfer/sample/export.json` from Settings → Import… on a scratch
  origin. Tests read fixtures through `src/lib/__tests__/fixtures.ts`.
- `src/lib/__tests__/tracker.spec.ts`: the shared tick-per-day helpers (totals, day counts, goals
  met, toggling, ids), including that `toggleDay` changes a reactive log through its proxy.
- `src/lib/__tests__/api.spec.ts`: how every kind of reply becomes a typed result (success, 204,
  401 for an ended session versus a wrong password, 409, gateway errors and network failures as
  offline, the API's own refusals with `Retry-After`).
- `src/lib/__tests__/nginx.spec.ts`: reads `nginx.conf`: the CSP is unchanged, and `/api/` proxies
  to `fitness-api:8000` through a variable upstream with the body cap and one `Cache-Control`.
- `src/lib/__tests__/fakeApi.ts` (a helper, not a spec): an in-memory API installed as `fetch`. It
  keeps plan revisions and 409s, identical-item creates, single-day ticks, settings, sessions and
  invite links. Controls let a test go offline, fail the next matching request, `hold()` every
  reply, `holdNext()` one, or `stall()` one forever. `signedIn.ts` sets up a browser already signed
  in as alice: the fake API, the remembered session, and an empty or given cache.
- `src/lib/__tests__/theme.spec.ts`: theme names and how System, Light and Dark resolve.
- `src/stores/__tests__/planner.spec.ts`: toggling, totals, week navigation, goal clamping, adding,
  removal's effect on totals, settings, detail chips, editing exercises, sets, weekly plans
  (defaults, carry forward, a week getting its own plan, copying to the next week), config mode,
  the midnight refresh, `adopt`, `adoptWeek` and `clear`, the theme being the only thing stored
  (merged into the settings key), the keys from before accounts never being written, and
  `savedSettings` (tracked in memory, set by adopting or changing settings, never by the theme).
- `src/stores/__tests__/diet.spec.ts`: food toggling in the planner's week, shared week navigation,
  goal clamping, add/remove, carrying and copying food plans, `adopt`, `adoptWeek` and `clear`, the
  old diet keys never being written.
- `src/stores/__tests__/sync.spec.ts`: the sync store against the fake API:
  - the cache shown at once, then the server's state; no cache, or a broken one;
  - a first tick creating the week's plan before the tick, and revisions carried forward;
  - diet and settings writes, and a toggle made while its write is in flight;
  - offline queueing, the backing-off retry timer, gateway errors as offline, and 401s handing
    control back;
  - conflicts (taking the server's copy with a notice, re-creating when the server has none, no
    notice for identical creates), and refused writes being dropped;
  - reads that must not undo local edits, including one the watcher has not seen;
  - other tabs' cache and outbox writes, stop and forget, the old keys never written, `diff` and
    `normaliseState`;
  - `importFile`: queued writes first, then one server import and a read; offline, refused, 401,
    and nobody signed in.
- `src/lib/__tests__/legacy.spec.ts`: reading the keys from before accounts (v2, the v1 migration,
  the accent and daily pick but never the theme, broken JSON, nothing worth offering).
- `src/components/__tests__/ImportPrompt.spec.ts`: the first-login prompt through the app: what it
  offers, Add (merged on the fake server, shown, remembered), Not mine, Later, offline and refused
  imports, an account that already holds everything, a browser with no earlier log, waiting for
  the account's state, and per-user answers.
- `src/stores/__tests__/session.spec.ts`: sign-in from a remembered user (online, offline, ended), a
  still-valid cookie, switching user, every login refusal, invite links, sign-out forgetting the
  device's data, and sign-out refused offline.
- `src/components/__tests__/App.spec.ts`: the mounted app in jsdom. Covers rendering, the today
  column, cell toggling and `aria-pressed`, footer colours, the goal stepper and its bounds,
  navigation, confirm-before-remove, print, the visibility and one-minute clock refresh, another
  tab's writes to the cache, the add form, the settings popover including focus return, and the theme: the
  `dark` class following the OS (with a stubbed `matchMedia`), the theme buttons and their
  persistence. Also the weight and sets fields, the edit dialog (with `showModal`/`close` stubbed,
  as jsdom has no modal dialogs), normal mode hiding every editing control, export (with
  `URL.createObjectURL` stubbed) and import through the file input (summary, confirm, cancel,
  errors), copying the plan to
  the next week (with and without the replace confirmation), and the carried-over note. Tests that
  edit the plan mount with `mountConfig()`, which turns config mode on. Queries that would also
  match the diet grid scope to `[data-testid="exercise-grid"]`; the rest rely on exercise-only
  labels or on the exercise form coming first in the DOM. Every mount is signed in as alice through
  `signedIn()`.
- `src/components/__tests__/Auth.spec.ts`: the sign-in form and its messages, an ended session, a
  double submit, invite and reset links (matching passwords, the length rule, expired links, a link
  pasted into a running tab), sign-out (with unsynced changes, and refused offline), and the sync
  status messages and triggers (loading, offline with and without a copy, retry, the conflict
  notice, focus, visibility and the minute tick).
- `src/components/__tests__/DietSection.spec.ts`: the diet section in the mounted app: default
  foods, ticking, footer and goals-met counts, shared week navigation, add/remove and the goal
  stepper (in config mode), cross-tab sync.

`vitest.config.ts` sets coverage thresholds (100% lines and functions, 99% statements, 98%
branches), so `npm run test:coverage` and CI fail when coverage drops below them.

Every test that depends on the date pins the clock with `vi.useFakeTimers({ toFake: ['Date'] })`
(the minute-tick test also fakes `setInterval`), and all tests build dates with local-time
constructors, so they pass in any timezone. No end-to-end browser tests run in CI.
