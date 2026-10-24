# API service

W2 of the multi-user build, written on 2026-10-24 between about 07:00 and 07:20 CEST. It adds
the server half of D2–D7: accounts, sessions, invite and reset links, synced plans, ticks and
settings, import and export, an admin CLI, and backups. It ships as a second image. Nothing
calls it yet; the client switches over in W3.

## 1. What changed

- `api/` is a Python 3.13 project (uv, FastAPI, argon2-cffi, sqlite3) with modules for config,
  the schema, validation, auth, data access, HTTP, backups and the CLI. `docs/api.md` documents
  it.
- `api/Dockerfile` builds `ghcr.io/johnmathews/exercise-planner-api`. `docker.yml` builds and
  publishes both images through a matrix, and smoke-tests each API architecture on pull
  requests.
- `ci.yml` gains an `api` job: ruff, mypy (strict), pytest with a 98% coverage floor, and
  `pip-audit`.
- `docker-compose.yml` runs both images locally.
- Four new shared fixtures in `fixtures/transfer/parse/` pin where Python's defaults differ from
  JavaScript's: week keys (non-ASCII digits, trailing newline), booleans as numbers, `NaN`, and
  section shapes. Vitest runs them too, so the TypeScript side is held to the same cases.

## 2. Decisions

- **Invite tokens never appear in a path.** The plan put them in the URL fragment so that no
  log would record them, but `GET /api/invites/{token}` would have put them straight back into
  nginx's, Traefik's and uvicorn's access logs. Lookup and redemption are `POST` requests with
  the token in the body.
- **The CLI fixes the username when it mints an invite** (P5). Usernames are 1 to 32 letters,
  digits, `.`, `_` or `-`, unique regardless of case. Passwords are 10 to 256 characters.
- **Lockout has a window.** Five failures within 15 minutes lock the account for 15 minutes.
  Failures spread over months do not add up to a lock.
- **Plan writes are idempotent for identical items** (P7). A stale `rev` with the same items as
  the stored plan succeeds. That covers two devices both creating a carried-forward week from one
  source, which a tick does (F3). A stale `rev` with different items gets 409 and the server's
  copy.
- **A tick is one SQL statement** (`INSERT … ON CONFLICT … RETURNING`), so two devices ticking
  different days of the same item cannot lose either write.
- **Import keeps all-false tick rows**, so that importing a file and exporting again gives the
  same file. The sample fixture round-trips byte-equal apart from `exportedAt`.
- **The arm64 image installs target wheels with uv**, with no QEMU, as F8 suggested. CI runs
  the arm64 image under QEMU only to import its native modules, which completes F8's check.
- **`httpx2`, not `httpx`.** Starlette 1.9's TestClient deprecates `httpx`, and the warning fails
  the strict test run.

## 3. Verified

- 135 pytest tests pass, covering every line and 161 of 164 branches. ruff and
  `mypy --strict` are clean, `pip-audit` finds no known vulnerabilities, and Vitest passes 32
  transfer tests, including the four new fixtures.
- Each test module was written before its code and failed first. Breaking a rule turned the
  matching test red each time:
  - Python's `round()` instead of `Math.round`, `\d` instead of `[0-9]`, and `json.loads`
    accepting `NaN` each failed a fixture.
  - The lockout threshold, the dummy hash for unknown users, and the expiry comparison each
    failed their auth test.
  - Removing the `Origin` check failed three tests; dropping the user filter on ticks failed the
    isolation test, and dropping P7 failed its test.
- The image builds natively (arm64) and cross-builds for amd64, and the amd64 image imports
  under emulation. In a running container:
  - `ep-admin invite` printed a working link, and redeeming it and logging in worked.
  - Data and backups went to `/data` as uid 10001.
  - Memory peaked at 107–109 MiB with hashing (43 MiB idle), so W5 should set `mem_limit: 160m`.
  - Four concurrent logins ran one after another (37, 67, 95, 123 ms).

## 4. Next

W3 points nginx at `fitness-api:8000` and moves the client onto the API.
