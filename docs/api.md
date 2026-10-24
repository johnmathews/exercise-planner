# API

> Purpose
>
> The API service in `api/`: accounts, sessions, invites, the synced data, the admin CLI and
> backups. It is the reference for the endpoints the client calls and for running the service.

## 1. Overview

A FastAPI app on Python 3.13, served by uvicorn on port 8000 as one process. It stores everything
in SQLite at `$DATA_DIR/fitness.db` (WAL mode, foreign keys on). The web container's nginx forwards
`/api/` to it, so the browser sees one origin and the CSP stays unchanged. Every user's rows are
scoped by `user_id`, and no endpoint reads another user's data.

| Module        | Holds                                                         |
| ------------- | ------------------------------------------------------------- |
| `config.py`   | `Config`, read from the environment (§6)                      |
| `db.py`       | connections, the schema and its migrations                    |
| `validate.py` | the port of `src/lib/storage.ts` and `src/lib/transfer.ts`    |
| `auth.py`     | password hashing, lockout, sessions, invite and reset tokens  |
| `data.py`     | reading and writing plans, ticks and settings; import, export |
| `app.py`      | the HTTP layer: routes, the write checks, error mapping       |
| `backup.py`   | the daily `VACUUM INTO` copy                                  |
| `cli.py`      | `ep-admin`                                                    |

## 2. Data model

| Table      | Key                                 | Columns                                                                                            |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `users`    | `id`                                | `username` (unique, case-insensitive), `password_hash`, `disabled`, lockout counters, `created_at` |
| `sessions` | `token_hash`                        | `user_id`, `created_at`, `last_seen`, `expires_at`                                                 |
| `invites`  | `token_hash`                        | `kind` (`invite` or `reset`), `username`, `user_id` (resets), `expires_at`, `used_at`              |
| `settings` | `user_id`                           | `accent`, `daily_pick`                                                                             |
| `plans`    | `(user_id, section, week)`          | `items_json`, `rev`                                                                                |
| `ticks`    | `(user_id, section, week, item_id)` | `days`, a 7-bit mask (bit 0 is Monday)                                                             |

`section` is `exercise` or `diet`. Every row cascades from its user. Tokens and session ids are
stored only as SHA-256 hashes. A database lookup with a stolen copy of the file cannot recover a
working cookie or link. Times are Unix seconds. The theme is not stored: it belongs to the device.

The schema version lives in `PRAGMA user_version`, and `db.migrate` applies each step in order at
startup inside a transaction.

## 3. Endpoints

All paths start with `/api`. Bodies are JSON, and errors are `{"error": "<code>"}`. Every response
carries `Cache-Control: no-store`.

**Writes** (`POST`, `PUT`) must send `Content-Type: application/json` and an `Origin` header equal
to `PUBLIC_ORIGIN`; otherwise they get 403 `origin` or 415 `content-type`. `SameSite=Lax` alone
would not stop a request from another `*.itsa-pizza.com` host, because the browser counts it as
same-site. Bodies over 1 MiB get 413.

| Method and path                            | Auth    | Does                                                                 |
| ------------------------------------------ | ------- | -------------------------------------------------------------------- |
| `GET /healthz`                             | no      | `SELECT 1`; `{"ok": true}`                                           |
| `POST /auth/login`                         | no      | `{username, password}` → `{username}` and the session cookie         |
| `POST /auth/logout`                        | session | ends this session and clears the cookie; 204                         |
| `GET /auth/me`                             | session | `{username}`                                                         |
| `POST /invites/lookup`                     | no      | `{token}` → `{kind, username}` for a live link; 410 `gone` otherwise |
| `POST /invites/redeem`                     | no      | `{token, password}` sets the password, consumes the link, signs in   |
| `GET /state`                               | session | everything the client renders (below)                                |
| `PUT /plans/{section}/{week}`              | session | `{items, rev}` → `{rev}`; 409 `conflict` with the server copy        |
| `PUT /ticks/{section}/{week}/{item}/{day}` | session | `{done}` → `{days}`, the week's seven flags for that item            |
| `PUT /settings`                            | session | `{accent, dailyPick}` → the stored settings                          |
| `GET /export`                              | session | the export file (`architecture.md` §4)                               |
| `POST /import`                             | session | an export file, merged in; → `{weeks, ticks, settings}` added        |

`GET /state` returns `{exercise, diet, settings}`. Each section is `{plans, log, revs}`: `plans`
and `log` have the same shape as in `localStorage`, and `revs` maps each planned week to its
revision. `settings` is `{accent, dailyPick}`, or null before any are saved.

**Plans.** `rev` is the revision the client last saw, 0 for a week it has never seen planned.
A matching `rev` stores the items and returns `rev + 1`. A stale `rev` gets 409 with `{items, rev}`
from the server, unless the stored items already equal the sent ones after validation. That
happens when two devices tick the same carried-forward week and both create its plan from the same
source. That write succeeds and returns the current `rev`. Items are validated with the same
rules as stored data, so a bad item drops out rather than failing the write.

**Ticks** set or clear one day for one item, so two devices ticking different days never collide.
`day` is 0 (Monday) to 6.

**Import** applies the merge rule from `architecture.md` §4: existing weeks keep their plan, ticks
are OR-ed, and settings apply only when the account has none. It returns what it added, in one
transaction. A file that fails to parse gets 400 with `json`, `format` or `version`, the same codes
the client shows.

## 4. Accounts and sessions

- **No sign-up.** `ep-admin invite <username>` mints a single-use link,
  `$PUBLIC_ORIGIN/#/invite/<token>`, valid for 7 days. The person opens it and chooses a password
  (10 to 256 characters). The username is fixed by the invite. `ep-admin reset <username>` mints a
  reset link the same way, valid for 24 hours. Using it ends every session of that user and clears
  any lockout. Minting a new link for a username revokes its earlier unused ones. The token travels
  in the URL fragment and then in request bodies, never in a path, so no access log (Traefik, nginx
  or uvicorn) records it. Redeeming with a password outside 10 to 256 characters gets 400
  `password`, and a used, expired or unknown link gets 410 `gone`.
- **Passwords** are hashed with argon2id at argon2-cffi's defaults (64 MiB, 3 passes,
  parallelism 4). One hash runs at a time (a process-wide semaphore), so concurrent logins queue
  instead of multiplying memory.
- **Lockout.** Five wrong passwords within 15 minutes lock the account for 15 minutes. While
  locked, every login gets 423 `locked`, even with the right password. A success resets the count.
  An unknown username costs the same hash as a known one and gets the same 401 `invalid`, so the
  response does not reveal which usernames exist. Traefik's rate limit sits in front of all of it.
- **Sessions** are 32 random bytes in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie named
  `__Host-session`. They last 90 days from the last use: a request more than a day after the last
  refresh moves the expiry forward and re-sends the cookie. Logout ends one session.
  `ep-admin revoke-sessions <username>` and a reset end them all. A disabled user's sessions stop
  working at once.

## 5. Admin CLI

`ep-admin` runs in the API container against the same database:

```sh
docker compose exec fitness-api ep-admin invite alice     # prints the invite link
docker compose exec fitness-api ep-admin reset alice      # prints a reset link
docker compose exec fitness-api ep-admin users            # username, created, disabled, sessions
docker compose exec fitness-api ep-admin disable alice    # blocks login and ends sessions
docker compose exec fitness-api ep-admin enable alice
docker compose exec fitness-api ep-admin revoke-sessions alice
```

## 6. Configuration

| Variable        | Default    | Meaning                                                                 |
| --------------- | ---------- | ----------------------------------------------------------------------- |
| `DATA_DIR`      | `/data`    | holds `fitness.db` and `backup/`                                        |
| `PUBLIC_ORIGIN` | (required) | e.g. `https://fitness.itsa-pizza.com`; checked on writes, used in links |
| `COOKIE_SECURE` | `true`     | `false` for plain-http local runs; the cookie is then `session`         |
| `BACKUP_KEEP`   | `7`        | daily copies kept in `$DATA_DIR/backup/`                                |

## 7. Backups

A background thread writes `$DATA_DIR/backup/fitness-YYYYMMDD.db` with `VACUUM INTO` once a day
(checked hourly, and at startup) and keeps the newest seven. The copy is a consistent, compact
database even while the API is writing. PBS backs up the whole directory on infra-vm. Settings →
Export gives each person a JSON copy of their own data as well.

## 8. Validation parity

`validate.py` mirrors the TypeScript normalisers rule for rule, including the places where Python
differs by default. Numbers round half up like `Math.round`, not to even, and `true` is not a
number. `NaN` and `Infinity` are not JSON. Week keys need ASCII digits, and a trailing newline is
not allowed. `tests/test_parity.py` runs every case in `fixtures/transfer/`, the same files the
Vitest suite runs. A rule changed on one side without the other fails one of the two suites.

## 9. Development

```sh
cd api
uv sync                                  # Python 3.13 and the dev tools
uv run pytest                            # tests
uv run coverage run -m pytest && uv run coverage report   # fails under 95%
uv run ruff check . && uv run ruff format --check .
uv run mypy
PUBLIC_ORIGIN=http://127.0.0.1:5173 COOKIE_SECURE=false DATA_DIR=./.data \
  uv run uvicorn --factory exercise_planner_api.app:create_app_from_env --port 8000
```
