# 2026-10-23 — Initial build from the design handoff

> Purpose
>
> Records how the Vue implementation came out of the design handoff, the choices made on the
> way, and what remains open.

## 1. Starting point

The repo began as `Weekly Exercise Planner.zip`: a handoff README, an HTML prototype on a
proprietary `dc` runtime, and that runtime (`support.js`). The handoff, unzipped, became the
first commit. The GitHub repo `johnmathews/exercise-planner` is public.

## 2. Decisions

- **Stack:** Vue 3 + Vite + TypeScript + Pinia, as the handoff recommends, scaffolded with
  `create-vue` (Vitest, ESLint + oxlint, Prettier).
- **Shipping:** Docker image on nginx-unprivileged, published to GHCR from `main`.
- **Settings:** a small popover for accent and daily pick, with the accent defaulting to green.
- **Compatibility:** the data key and shape match the prototype; settings use a second key.
- **Fixed from the prototype:** stored data is validated rather than trusted, and grid cells
  are keyboard-operable buttons.

## 3. Verification

A side-by-side browser comparison against the prototype at 1280px matched layout, colours and
spacing. The one visible difference, form-field size, came from the prototype's `content-box`
inputs, and the build now matches it. Print emulation produced the white sheet with black done
cells. At 390px the grid scrolls sideways as designed. The container served the app, deep links,
`/healthz`, and immutable asset caching.

## 4. Snags

- npm 10.9 crashed in its resolver (`edgesOut` of null) on this tree; npm 11 installs cleanly.
- The scaffold's `tsconfig.vitest.json` had `"lib": []`, which hid `Array.prototype.at`; it now
  lists `ES2023` and the DOM libs.

## 5. Review round (wrap-up)

An independent code review and a separate docs-versus-code audit ran before merge. Changes made:

- **Cross-tab overwrite (Medium, confirmed by reading the code):** a stale tab wrote its whole
  state back and erased another tab's edits. `App.vue` now listens for `storage` events, and
  `writeKey` skips unchanged values so adopting a write never echoes it back.
- **Prototype byte-compatibility (confirmed by test):** normalisation dropped the prototype's
  `perSide: false` and reordered keys. Both now follow the prototype, and a test asserts an exact
  string round-trip.
- **Midnight in a visible tab:** a one-minute tick now backs up `visibilitychange`.
- **Accessibility:** steppers use `aria-disabled` (keeps focus), the popover returns focus on
  Escape, and the radio-role buttons became `aria-pressed` toggles.
- **Duplication:** one `NumberStepper` replaces two copies of the stepper markup and CSS.
- **nginx:** gzip, `nosniff`, `no-referrer` and a CSP, all set at server level via a `map`. In a
  browser against the container, the CSP produced no console errors and inline accent styles
  still applied (confirmed).
- **Workflow permissions:** PR builds hold `contents: read` only; `packages: write` exists only in
  the `main` publish job. Checkouts set `persist-credentials: false`.
- **Docs:** 15 audit findings fixed, mostly overstatements (e.g. "end to end" for jsdom tests,
  "type-checks before bundling" for a parallel run) and gaps (scripts, actions, validation rules).

## 6. What is deliberately not done

- **No sync or backup.** Data is per-browser and per-origin; the handoff names sync as a future
  option, and it needs a backend this build avoids.
- **No end-to-end browser tests in CI.** The jsdom suite covers behaviour; the visual comparison
  was a one-off manual check. Playwright in CI would cost more than the app's size justifies today.
- **No real radio-group keyboard pattern.** Toggle buttons were chosen over `role="radio"` with
  roving tabindex: the groups have two to four options, and Tab reaches each.
