# Sample data fixture for export tests

Written on 2026-10-24 at about 07:00 CEST, after W1 merged. John asked for test data, so that the
export test exports something useful. Until now the App tests exported a few ticks over the default
plan, and so does a fresh browser, which made a thin export hard to tell apart from a broken one.

## 1. What changed

- `fixtures/transfer/sample/storage.json` is a realistic `localStorage` snapshot:
  - five weeks, 2026-09-21 to 2026-10-19, with one week left untouched so it carries the plan
    before it forward;
  - plans that change over time: sets, then weights, Back extensions removed and Plank added;
  - 102 ticks, a diet with an added food (Eggs), and a blue accent, 4 per day and the dark theme.
- `fixtures/transfer/sample/export.json` is the export that snapshot must produce.
- Two App tests:
  - seeding the snapshot and pressing Export gives `export.json`;
  - importing `export.json` into an empty browser gives back the snapshot, except that the theme
    stays at the device's default.
- `src/lib/__tests__/fixtures.ts` holds the one fixture reader, which `transfer.spec.ts` now
  uses.

## 2. Decisions

- **Generated once, committed as data.** A throwaway script wrote the snapshot with a fixed,
  irregular tick pattern. Only the JSON is committed, because it is the contract and a reviewer
  should read data, not code that makes it.
- **Every value is already in normalised form**, so loading the snapshot changes nothing, and
  export must equal it exactly. Any drift in validation or export shows up as a diff.
- **The same file serves W2.** The API's tests can import `sample/export.json` as a realistic
  payload.

## 3. Verified

- 174 tests pass (2 new). Lint, format, type-check and build are clean.
- Both new tests went red when export dropped the diet log and when import skipped the diet store.
- In Playwright (port 5181, never 5173), importing `export.json` by hand into an empty origin
  showed "Adds 6 weekly plans and 102 ticks, plus the accent and exercises per day". The week
  renders with the edited plan, the chips and the ticks, and the console stays clean.
