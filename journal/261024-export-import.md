# Export and import

The first unit (W1) of the multi-user build, written on 2026-10-24 from 06:30 CEST. John's real
log lives only in the `localStorage` of the dev server's origin, `http://127.0.0.1:5173`, and the
app had no way to take data out of a browser. This ships on its own, before any server work, so
John can export that data before `main` moves to the synced client.

## 1. What changed

- Settings has a **Data** group. **Export** downloads `exercise-planner-YYYY-MM-DD.json`.
  **Import…** reads one, shows what it would add ("Adds 2 weekly plans and 3 ticks. Nothing
  already here changes."), and merges on **Import**. Errors show inline.
- `src/lib/transfer.ts` holds the format (`exercise-planner-export`, version 1), `parseExport`,
  `mergeTracked`, `mergeSummary`, `mergeSettings` and the download. `storage.ts` now exports its
  normalisers so the file is validated exactly like stored data.
- Both stores gain `importData`; the planner also gains `savedSettings`.
- `fixtures/transfer/` holds the parse and merge cases as JSON with expected results. Prettier
  checks it along with `src/`.
- `vitest.config.ts` sets coverage thresholds (100% lines and functions, 99% statements, 98%
  branches). The evaluation found the "~100%" bar was stated but never enforced.

## 2. Decisions

- **Import merges and never deletes.** A week with a plan keeps it, ticks are OR-ed, and the
  file's accent and daily pick apply only when nothing is saved. The same rule will govern the
  API's import and the first-login prompt, so an import can never lose data, wherever it runs.
  The rejected alternative, replacing everything, would make restoring an old backup destroy
  newer ticks.
- **The theme is not exported.** It belongs to the device, and the server will not store it.
- **One format for the file and the future API.** The JSON fixtures are the contract. The API's
  Python validators will run the same files, so the two implementations cannot drift unnoticed.
- **An empty plan counts as a plan.** A week whose own plan was emptied on purpose stays empty on
  import rather than taking the file's items.
- **The confirm step counts exercise and food plans separately** ("weekly plans"), because a
  week can gain either or both.

## 3. Verified

- 164 tests pass (41 new). Lint, format, type-check and the build are clean, and coverage meets
  the new thresholds. Each new test was seen failing first. Sabotaging the merge rule (incoming
  weeks win) failed two merge fixtures. Stubbing out the stores' `importData` failed four store
  tests, and dropping the confirm button's import call failed two App tests.
- In Playwright, a dev server ran from the worktree on port 5180, never 5173. Ticks and an
  accent change on `127.0.0.1:5180` were exported, then imported into `localhost:5180`, a
  second empty origin. Plans, log, diet and settings came out identical. A second import of the
  same file reported "Nothing new". The popover fits at 1280, 390 and 320px in light and dark,
  with no horizontal overflow. Print hides it, even when it is open.

## 4. Next

John merges, runs `git pull` in the main checkout so the 5173 dev server picks this up, and
exports. W2, the API service, can start in the meantime. W3, the synced client, does not merge
until John confirms the export.
