# Decisions: multi-user accounts and sync

> Purpose
>
> The record of why the planner has accounts, a Python API and server-side sync, and of the
> choices made while building them in October 2026. The journals and pull requests cite these IDs
> (D3, P7); this is where they resolve. The current design lives in [architecture.md](architecture.md)
> and [api.md](api.md); this file keeps the reasons.

## 1. Context

Until October 2026 every log lived in one browser's `localStorage`. Data did not move between
devices, nothing was backed up, and the public route at `fitness.itsa-pizza.com` needed no auth
because nothing was on the server. The route runs Cloudflare tunnel → Traefik (rate-limited) → the
web container on infra-vm, whose port is also reachable on the LAN, so no design may trust an
unauthenticated header.

## 2. Settled before the build (2026-10-23)

| ID  | Topic                   | Decision                                                                | Rejected                                       |
| --- | ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| D1  | Users                   | John plus a few named people; no open sign-up                           | —                                              |
| D2  | Scope                   | Server accounts, synced across devices                                  | Local profiles per browser: no sync, no backup |
| D3  | Auth                    | Username and password in the app; Cloudflare Access stays off the route | Verifying Access JWTs                          |
| D4  | Shape                   | The nginx web container plus a separate API container                   | One Node container serving both                |
| D5  | API language            | Python 3.13, FastAPI, uv, pytest and coverage                           | TypeScript, sharing the validators             |
| D6  | Routing                 | nginx `proxy_pass` forwards `/api` to the API service                   | —                                              |
| D7  | Accounts                | Single-use invite links, minted from an admin CLI                       | The CLI setting passwords itself               |
| D8  | Access in front as well | No: one login                                                           | —                                              |

The rejected options in D3, D4, D5 and D7 were the recommendations at the time. D5's cost, two
copies of the validation rules, is paid by the shared fixtures in `fixtures/transfer/`, which both
test suites run.

## 3. Made while planning and building (2026-10-24)

| ID  | Decision                                                                                                                                | Why                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P1  | One export format (`exercise-planner-export` v1) for the file, `GET /api/export` and `POST /api/import`                                 | One validator per language, one set of fixtures                                                               |
| P2  | Import always merges and never deletes: existing weeks keep their plan, ticks are OR-ed, settings apply only when there are none        | No import, anywhere, can destroy data                                                                         |
| P3  | The theme is never exported or synced                                                                                                   | It belongs to the device; `public/theme-init.js` reads it before first paint                                  |
| P4  | Invite and reset tokens travel in the URL fragment, then in request bodies, never in a path                                             | No access log (Traefik, nginx, uvicorn) records them                                                          |
| P5  | The CLI fixes the username when it mints an invite                                                                                      | A leaked link cannot claim an arbitrary name                                                                  |
| P6  | Every write must carry `Origin` equal to `PUBLIC_ORIGIN` and a JSON body                                                                | `SameSite=Lax` alone treats other `*.itsa-pizza.com` hosts as same-site                                       |
| P7  | A plan create whose items match the stored plan succeeds instead of conflicting                                                         | A first tick creates the week's plan, and two devices do that from the same source                            |
| P8  | Argon2 at its defaults, one hash at a time, a bounded login queue, and the API's own memory limit (160m, measured)                      | One hash takes 64 MiB, the web container's whole limit                                                        |
| P9  | Synced data lives in new per-user cache keys; the keys from before accounts are never written                                           | The old data survives untouched, for the first-login import                                                   |
| P10 | nginx forwards to the host `fitness-api:8000`                                                                                           | The production compose file names the service to match                                                        |
| P11 | Invite links last 7 days; reset links 24 hours                                                                                          | John, at the planning gate                                                                                    |
| P12 | Sessions last 90 days from last use, refreshed at most daily; logout ends one, a reset ends all                                         | John, at the planning gate                                                                                    |
| P13 | The home-server deployment (W5) is part of this work, not a hand-off                                                                    | John, at the planning gate                                                                                    |
| P14 | Every request names its user (`X-Expected-User`), and the API refuses any other                                                         | A tab left open as one person must never touch the account of someone who signed in later on the same browser |
| P15 | Writes become operations by diffing the stores against the state the server is known to hold, rather than one API call per store action | Every write path, present and future, syncs without extra code                                                |
| P16 | Tabs share the cache and outbox through `localStorage` events, not a `BroadcastChannel`                                                 | The cache is in `localStorage` already; one channel instead of two                                            |
| P17 | Sign-out is refused while offline                                                                                                       | The session cookie is HttpOnly, so only the server can end it                                                 |
| P18 | Imports, from a file or the first-login prompt, merge on the server in one request                                                      | One transaction against the account's real state, not one write per tick                                      |

## 4. Accepted risks

Each is described where it applies:

- the lockout can reveal and block a username; sessions have no absolute lifetime; a user's own
  data has no size cap ([api.md](api.md) §8);
- two tabs racing on the shared outbox inside Chrome's cross-process delay, and a session that ends
  by itself keeping its cache ([architecture.md](architecture.md) §7);
- while the API restarts, Docker's DNS can forward the web container's `fitness-api` lookup to the
  LAN resolver (home-server `documentation/infra_vm.md`, "Fitness").

## 5. How it was built

Six units, each its own pull request with a journal entry:

| Unit | What                              | PR               | Journal                                     |
| ---- | --------------------------------- | ---------------- | ------------------------------------------- |
| W1   | JSON export and import            | #6               | `journal/261024-export-import.md`           |
| W6   | Sample-data fixture               | #7               | `journal/261024-sample-export-fixture.md`   |
| W2   | The API service and its image     | #8               | `journal/261024-api-service.md`             |
| W3   | Sign-in, sync and the nginx proxy | #9               | `journal/261024-synced-client.md`           |
| W4   | The first-login import prompt     | #10              | `journal/261024-import-prompt.md`           |
| W5   | The infra-vm deployment           | home-server #245 | home-server `journal/261024-fitness-api.md` |
