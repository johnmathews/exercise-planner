# Development

> Purpose
>
> The toolchain, the scripts, and how the tests are organised.

## 1. Toolchain

- Node `^22.18.0 || >=24.12.0` (from `engines` in `package.json`).
- **npm 11.** npm 10.9, which ships with Node 22, crashes during install with
  `Cannot read properties of null (reading 'edgesOut')` while resolving this dependency tree's
  peer sets. Install npm 11 first (`npm install -g npm@11`) or run it ad hoc with
  `npx -y npm@11 install`. CI and the Dockerfile both do the former.
- Vue 3.5, Pinia 4, Vite 8, TypeScript 6, Vitest 4 with jsdom, ESLint 10 + oxlint, Prettier.

## 2. Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Vite dev server with Vue devtools |
| `npm run build` | type-check and production build into `dist/` |
| `npm run preview` | serve `dist/` |
| `npm test` | run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | suite plus v8 coverage (text summary, HTML in `coverage/`) |
| `npm run type-check` | `vue-tsc --build` across app, node and test configs |
| `npm run lint` | oxlint then ESLint, read-only (CI runs this) |
| `npm run lint-fix` | both linters with `--fix` |
| `npm run format` / `format:check` | Prettier over `src/` |

The linters ignore `design_handoff_exercise_planner/`, which holds vendored prototype code.

## 3. Tests

Tests sit in `__tests__/` next to the code they cover:

- `src/lib/__tests__/dates.spec.ts`: Monday maths, offsets, year boundary, DST week, labels.
- `src/lib/__tests__/storage.spec.ts`: payload validation, prototype round-trip, settings
  parsing, storage that throws.
- `src/stores/__tests__/planner.spec.ts`: toggling, totals, week navigation, goal clamping,
  add/remove, persistence, settings, the midnight refresh.
- `src/components/__tests__/App.spec.ts`: the mounted app end to end: rendering, today column,
  cell toggling and `aria-pressed`, footer colours, goal stepper, navigation, confirm-before-remove,
  print, the add form, and the settings popover.

Tests pin the clock with `vi.useFakeTimers({ toFake: ['Date'] })` and build dates with local-time
constructors, so they pass in any timezone.
