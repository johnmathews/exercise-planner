# Exercise Planner

> Purpose
>
> A weekly workout and diet log: exercises and foods down the side, Monday–Sunday across the top,
> one click to tick a day. Vue 3 + Vite + Tailwind single-page app with light and dark themes;
> state lives in the browser's `localStorage`.

## 1. What it does

- **Exercises.** Each day, pick a few exercises (default three) and click their cells when done. The
  **Week** column counts sessions against a weekly goal of 0–7 days and turns accent-coloured once a
  non-zero goal is met. The footer counts picks per day: accent when the daily target is met, orange
  when over.
- **Diet.** Below the exercises, foods work the same way: tick each day you ate one, and its Week
  column counts days against a goal. The section header shows how many food goals are met. Defaults
  are Vegetables (7), Fruit (5), Fish (2) and Nuts (3).
- Add an exercise with a name, an optional rep count, "per set" or "each side, per set", and an
  optional weight in kg (e.g. squats with a 12 kg kettlebell); add a food by name. New items start
  with a goal of 3. `✎` edits an exercise; `×` removes an item after a confirmation (its history
  stays stored).
- `‹` / `›` move between weeks for both sections; past weeks persist. **Print…** produces a
  black-on-white sheet.
- **Settings** sets the theme (System, Light or Dark), the accent colour and the exercises-per-day
  target (1–8).

## 2. Getting started

Prerequisites: Node `22.18+` or `24.12+`, and **npm 11**. Node 24.12+ ships npm 11; on Node 22,
upgrade npm first, because the bundled npm 10.9 crashes while resolving this project's dependencies.

```bash
git clone https://github.com/johnmathews/exercise-planner.git
cd exercise-planner
npm install -g npm@11      # Node 22 only; or run: npx -y npm@11 ci
npm ci
npm run dev                # http://localhost:5173
```

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

The app is static files served by nginx in a container. CI publishes a multi-architecture image
(`linux/amd64` and `linux/arm64`) to GHCR on every push to `main`:

| Tag               | Points at                                           |
| ----------------- | --------------------------------------------------- |
| `latest`          | the newest build of `main`                          |
| `sha-<short sha>` | a specific commit (e.g. `sha-c28cb59`), for pinning |

Run it with Docker; the container listens on port **8080** as a non-root user:

```bash
docker run -d --name exercise-planner --restart unless-stopped -p 8080:8080 \
  ghcr.io/johnmathews/exercise-planner:latest
```

Or with Docker Compose:

```yaml
services:
  exercise-planner:
    image: ghcr.io/johnmathews/exercise-planner:latest
    ports:
      - '8080:8080'
    restart: unless-stopped
```

Update to the newest build with `docker compose pull && docker compose up -d` (or `docker pull` and
recreate the container). `GET /healthz` returns `200 ok`, and the image's `HEALTHCHECK` uses it. To
build the image yourself instead: `docker build -t exercise-planner .`

**Keep the URL stable.** Every log lives in each browser's `localStorage`, scoped to the exact
origin (scheme, host and port). Serving the app from a new hostname or port starts every browser
with an empty log, and clearing site data erases it. No server-side copy exists.

[docs/deployment.md](docs/deployment.md) covers the image, nginx headers and the CI pipeline.

## 4. Documentation

| Doc                                                                           | Covers                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                  | Components, stores, storage format, design decisions |
| [docs/development.md](docs/development.md)                                    | Toolchain, scripts, conventions, tests               |
| [docs/deployment.md](docs/deployment.md)                                      | Docker image, nginx, CI, GHCR publishing             |
| [design_handoff_exercise_planner/](design_handoff_exercise_planner/README.md) | The original design spec and HTML prototype          |

Development history lives in [`journal/`](journal/).
