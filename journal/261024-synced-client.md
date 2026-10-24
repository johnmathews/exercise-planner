# Synced client

W3 of the multi-user build, written on 2026-10-24 between about 07:30 and 08:00 CEST. The app
now signs in and syncs each person's data through the API from W2. nginx forwards `/api/` to the
API container. W4 (the first-login import prompt) and W5 (the home-server deployment) follow.

## 1. What changed

- **nginx** forwards `/api/` to `fitness-api:8000` through a variable upstream on Docker's
  resolver, so it starts, and serves the app, with the API down. The CSP is unchanged, and a test
  now holds it byte for byte. Vite proxies `/api` in development.
- **`src/lib/api.ts`** turns every reply into one of: success, `auth`, `conflict`, `offline` or
  `refused` with the API's code.
- **The stores** no longer persist anything except the theme. They start empty and are filled
  through `adopt`, `adoptWeek` and `clear`. The keys from before accounts are only ever read now,
  for the first-login import in W4.
- **`src/stores/sync.ts`** keeps the per-user cache and the outbox. It diffs the stores against the
  state the server is known to hold, queues plan, tick and settings writes, sends them in order,
  retries offline with backoff, handles 409s and 401s, and reads on start, focus, visibility and
  every minute (`architecture.md` §7).
- **`src/stores/session.ts`** signs in at once from a remembered user, then confirms with the
  server. It also handles login, invite and reset links, and sign-out, which deletes the device's
  copy and is refused offline.
- **New components:** `LoginForm`, `PasswordForm`, `AuthCard` and `SyncStatus`, plus an Account
  row in Settings.
- **`scripts/compose-smoke.sh`** runs both images behind nginx: sign-up, a write, a read, the
  `Origin` check, and the API down giving 502 while the app is still served. CI runs it as the
  `compose` job.

## 2. Decisions

- **Diff-based sync, not a write call in each action.** Every store change becomes a diff
  against `base`, so any write path syncs without extra code: ticks, the plan copy a first tick
  makes, edits, copying a week, and imports. The diff is cheap at this data size.
- **The tab-sync design changed.** The plan had a `BroadcastChannel`. Instead, the cache lives in
  `localStorage`, and its `storage` events tell other tabs; they adopt the state as their base and
  share the outbox. One channel instead of two.
- **Optimistic sign-in.** `session.init()` runs before the first render, so a remembered user sees
  their cached data with no flash of the sign-in screen, and can work offline.
- **Sign-out needs the server.** The session cookie is HttpOnly, so only the API can end it.
  Clearing the device while offline would leave the cookie live and sign the user back in on the
  next visit, so the app refuses and says why.

## 3. Bugs found by the tests on the way

- **A wrong password showed "Something went wrong".** The API client mapped every 401 to "session
  ended". Only 401 `auth` means that now; 401 `invalid` keeps its code.
- **A read could overwrite an edit before it was queued.** Vue runs the deep watcher after a
  reply can already have resolved, so a refresh landing in the same tick as an edit replaced it.
  The App form tests caught it. A read, and another tab's cache write, now diff the stores
  themselves before deciding.
- **`toggleDay` mutated raw objects.** `week[id] ??= …` returns the raw array, so the day flip
  notified no watcher. It worked only because earlier changes in the same action had triggered
  one. It now reads each level back through the reactive log.
- **Two versions of one plan or settings write looked alike.** These writes read their values
  when sent, so the reply to the first in flight also removed a newer one queued behind it. Each
  queued write now has an id.
- **`readJson` accepted arrays as objects.** It now uses `isRecord`.

## 4. Verified

- **Unit tests:** 286 pass, covering 100% of lines and functions (98.7% branches). Lint, format,
  types and the build are clean.
- **Red checks.** The sync and session tests were written alongside the code, so a sabotaged
  version of each core rule was run against them. Every sabotage failed its test:
  - the read-race guard, adopting the server's copy on a conflict, dequeuing by id, and reading
    only with an empty outbox;
  - clearing data on a user switch, refusing sign-out offline, and remembering the user.

  Two sync tests and one session test did not catch their sabotage at first. They were tightened
  until they did.

- **Compose smoke:** `scripts/compose-smoke.sh` passed locally in about 45 seconds.
- **In Playwright**, against the real API with throwaway data on port 8001 and Vite on port 5182
  (never 5173):
  - an invite was redeemed and the token cleared from the address bar;
  - ticks reached the server, with the week's plan created first;
  - a second browser context signed in and saw them;
  - its tick on another day appeared in the first context on focus.
  - With the API stopped, a tick queued with "Offline. 1 change will sync when the connection is
    back." Restarting the API and pressing Retry synced it.
  - Signing out left no app keys behind.
  - The sign-in and invite screens fit at 1280, 390 and 320 px in light and dark, and print shows
    only the grids.
