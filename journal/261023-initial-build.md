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

## 5. Open

- No sync or backup; data is per-browser and per-origin.
- No end-to-end browser tests in CI; the component suite runs in jsdom.
