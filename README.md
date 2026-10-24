# Fitness Planner

> Purpose
>
> A weekly workout and diet log: exercises and foods down the side, Monday–Sunday across the top,
> one click to tick a day. Vue 3 + Vite + Tailwind single-page app with light and dark themes,
> and a Python API that keeps each person's data in sync across devices.

## 1. What it does

- **Exercises.** Each day, pick a few exercises (default three) and click their cells when done. The
  **Week** column counts sessions against a weekly goal of 0–7 days and turns accent-coloured once a
  non-zero goal is met. The footer counts picks per day: accent when the daily target is met, orange
  when over.
- **Diet.** Below the exercises, foods work the same way: tick each day you ate one, and its Week
  column counts days against a goal. The section header shows how many food goals are met. Defaults
  are Vegetables (7), Fruit (5), Fish (2) and Nuts (3).
- **Normal mode and config mode.** The app opens in normal mode, where you only tick cells. The
  **Edit plan** switch in the top bar turns on config mode for changing the plan:
  - add an exercise with a name, optional sets, reps, "per set" or "each side, per set", and an
    optional weight in kg (e.g. squats with a 12 kg kettlebell); add a food by name;
  - `✎` edits an exercise, `×` removes an item after a confirmation (its ticks stay stored), and
    `−` / `+` change a weekly goal. New items start with a goal of 3.
- **Weekly plans.** Each week has its own plan, so reps, sets, weights and goals can change from week
  to week. A week you haven't changed carries over the latest earlier week's plan; it gets its own
  copy the first time you change it or tick a cell. In config mode, **Copy plan to next week**
  copies this week's exercises and foods over the next week's.
- `‹` / `›` move between weeks for both sections; past weeks persist. **Print…** produces a
  black-on-white sheet.
- **Settings** sets the theme (System, Light or Dark), the accent colour and the exercises-per-day
  target (1–8), and shows who is signed in, with **Sign out**.
- **Accounts and sync.** Each person signs in with a username and password. Accounts come only from
  invite links (`docs/api.md` §4). Plans, ticks, the accent and the daily pick are stored on the
  server and sync across devices; the theme stays with each device. The app opens from a cached
  copy and keeps working offline, sending changes once the connection is back.
- **Export and import.** Settings → **Export** downloads your plans, ticks, accent and daily pick
  as a JSON file; **Import…** merges such a file into your account. An import only adds: weeks you
  already have keep their plan, and no tick is ever cleared. The export is your own copy of your
  data.
- **Moving a log from before accounts.** A browser that kept a log before accounts existed offers
  it once you sign in: **Add to my account** merges it in, **Not mine** stops the question for you
  on that browser, **Later** asks next time. A log in another browser or profile can be moved with
  Export there and Import… here.

## 2. Getting started

Prerequisites: Node `22.18+` or `24.12+`, and **npm 11**. Node 24.12+ ships npm 11; on Node 22,
upgrade npm first, because the bundled npm 10.9 crashes while resolving this project's dependencies.

```bash
git clone https://github.com/johnmathews/fitness-planner.git
cd fitness-planner
npm install -g npm@11      # Node 22 only; or run: npx -y npm@11 ci
npm ci
npm run dev                # http://localhost:5173
```

The app needs the API to sign in. Run it alongside (Python 3.13 and [uv](https://docs.astral.sh/uv/)),
with `PUBLIC_ORIGIN` set to the dev server's origin, and mint yourself an invite:

```bash
cd api && uv sync
export PUBLIC_ORIGIN=http://localhost:5173 COOKIE_SECURE=false DATA_DIR=./.data
uv run fp-admin invite you                      # prints http://localhost:5173/#/invite/…
uv run uvicorn --factory fitness_planner_api.app:create_app_from_env --port 8000
```

Vite forwards `/api` to `http://127.0.0.1:8000` (set `API_URL` to change it). Open the invite link
from the dev server's own address: the API checks the `Origin` of every write, so
`http://127.0.0.1:5173` and `http://localhost:5173` are different origins.

Day-to-day commands:

```bash
npm test                   # Vitest suite (jsdom)
npm run test:coverage      # suite + coverage report in coverage/
npm run lint               # oxlint + ESLint
npm run type-check         # vue-tsc
npm run build              # type-check + production build into dist/
npm run preview            # serve dist/ locally
```

[docs/development.md](docs/development.md) covers the toolchain, conventions and test layout.

## 3. Deploy

Two containers: the app (static files on nginx, port **8080**) and the API (port **8000**), with
nginx forwarding `/api/` to the API so the browser sees one origin. CI publishes both as
multi-architecture images (`linux/amd64` and `linux/arm64`) to GHCR on every push to `main`:

| Image                                     | Tags                        |
| ----------------------------------------- | --------------------------- |
| `ghcr.io/johnmathews/fitness-planner`     | `latest`, `sha-<short sha>` |
| `ghcr.io/johnmathews/fitness-planner-api` | `latest`, `sha-<short sha>` |

Run them with Docker Compose. The API service must be named `fitness-api`, since that is the
host `nginx.conf` forwards to:

```yaml
services:
  web:
    image: ghcr.io/johnmathews/fitness-planner:latest
    ports:
      - '8080:8080'
    restart: unless-stopped
  fitness-api:
    image: ghcr.io/johnmathews/fitness-planner-api:latest
    environment:
      PUBLIC_ORIGIN: https://fitness.example.com # the address people open
    volumes:
      - ./fitness-data:/data # owned by uid 10001
    mem_limit: 160m
    restart: unless-stopped
```

Create the data directory first, owned by the API's user. Docker would otherwise create it as
root, and the API (uid 10001) could not write its database:

```bash
mkdir fitness-data && sudo chown 10001:10001 fitness-data
```

Then start both, mint the first account, and open the link it prints:

```bash
docker compose up -d
docker compose exec fitness-api fp-admin invite <name>
```

Serve it over HTTPS: the session cookie is `Secure`. For a plain-http trial, set
`COOKIE_SECURE: 'false'` on the API. Update with `docker compose pull && docker compose up -d`.
`GET /healthz` (nginx) and `GET /api/healthz` (the API) both return 200.
`docker compose up --build` in this repo runs both from source, serving the app on
`http://localhost:8083` (its `PUBLIC_ORIGIN`), and `scripts/compose-smoke.sh` checks the whole path
end to end.

[docs/deployment.md](docs/deployment.md) covers the images, nginx and CI, and
[docs/api.md](docs/api.md) the API, accounts, backups and `fp-admin`.

## 4. Documentation

| Doc                                                                           | Covers                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                  | Components, stores, storage format, design decisions |
| [docs/development.md](docs/development.md)                                    | Toolchain, scripts, conventions, tests               |
| [docs/deployment.md](docs/deployment.md)                                      | Docker images, nginx, CI, GHCR publishing            |
| [docs/api.md](docs/api.md)                                                    | The API service: endpoints, accounts, CLI, backups   |
| [docs/decisions.md](docs/decisions.md)                                        | Why accounts and sync are built the way they are     |
| [design_handoff_exercise_planner/](design_handoff_exercise_planner/README.md) | The original design spec and HTML prototype          |

Development history lives in [`journal/`](journal/).
