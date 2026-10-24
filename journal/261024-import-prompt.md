# First-login import prompt

W4 of the multi-user build, written on 2026-10-24 between about 08:10 and 08:25 CEST. A browser
that kept a log before accounts existed now offers that log to whoever signs in, and Settings →
Import… merges files on the server.

## 1. What changed

- **`src/lib/legacy.ts`** reads the keys from before accounts with the parsing and migration the
  stores used then. It never writes or removes them, and keeps a per-user marker for the prompt's
  answer.
- **`ImportPrompt`** appears above the week once the account's state has loaded:
  - It offers the log only if it holds something the account lacks, and names what it would add.
  - **Add to my account** merges it on the server. **Not mine** remembers the answer for that user
    on this browser. **Later** asks again on the next load.
- **`sync.importFile`** sends queued writes, posts the data to `POST /api/import`, and reads the
  result. Settings → Import… now uses it too: one request merged against the account's real state,
  instead of a local merge sent as one write per tick.
- **`useImportSummary`** is the "Adds N weekly plans and M ticks…" logic, now shared by the popover
  and the prompt.
- **Removed:** the stores' local `importData` actions, now unused; their tests became
  `savedSettings` tests.
- **The fake API** gained `/import`, built on the same TypeScript merge rules.

## 2. Decisions

- **The server merges imports.** One transaction against the server's state, with the same rules
  as everywhere else, so an import can't race the outbox or depend on what this tab has loaded.
- **Nothing to add means nothing to ask.** If the account already has everything the keys hold
  (imported from another device, say), the prompt records `imported` silently.
- **Only an accent or a daily pick counts as earlier settings.** Every device still writes its
  theme to the same key, so a theme alone means nothing to import.
- **The old keys stay.** They are the browser's own record and cost nothing. A shared browser
  offers its log to each person until each answers.
- **Export stays local.** It writes what the stores show, which works offline. The plan had
  suggested `GET /api/export`, which adds nothing for the person exporting.

## 3. Verified

- 325 tests pass (20 more than after W3), covering every line and function. Lint, format, types and the build
  are clean.
- **Red checks:** each prompt rule was broken in turn, and every break failed its tests:
  - not remembering the answer;
  - asking when there is nothing to add;
  - sharing one marker between users.
- **In Playwright,** against the real API with throwaway data (port 8002, Vite on 5183, never
  5173): a fresh origin with an earlier log signed up through an invite.
  - The prompt offered "1 weekly plan and 3 ticks, plus the accent and exercises per day".
    **Add to my account** put the week, its ticks and the accent on the server and showed them
    at once.
  - After a reload, the prompt did not come back.
  - The prompt fits at 1280, 390 and 320 px in light and dark, and is hidden in print.
