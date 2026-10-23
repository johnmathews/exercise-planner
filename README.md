# Exercise Planner

> Purpose
>
> A weekly workout log: exercises down the side, Monday–Sunday across the top, one click to mark
> a session done. Vue 3 + Vite single-page app, state in the browser's `localStorage`.

## 1. Quick start

```bash
npm install -g npm@11   # npm 10.9 cannot resolve this tree; see docs/development.md
npm ci
npm run dev             # http://localhost:5173
```

Run the container instead:

```bash
docker run -p 8080:8080 ghcr.io/johnmathews/exercise-planner:latest
```

## 2. What it does

- Each day, pick a few exercises (default three) and click their cells when done.
- The **Week** column counts sessions per exercise against a weekly goal of 0–7 days; the count
  turns accent-coloured once a non-zero goal is met.
- The footer counts picks per day: accent when the daily target is met, orange when over.
- Add an exercise with a name, an optional rep count, and "per set" or "each side, per set"; new
  exercises start with a goal of 3. `×` removes one after a confirmation (its history stays stored).
- `‹` / `›` move between weeks; past weeks persist. **Print…** produces a black-on-white sheet.
- **Settings** sets the accent colour and the daily pick (1–8).

## 3. Documentation

| Doc                                                                           | Covers                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                  | Components, store, storage format, design decisions |
| [docs/development.md](docs/development.md)                                    | Toolchain, scripts, conventions, tests              |
| [docs/deployment.md](docs/deployment.md)                                      | Docker image, nginx, CI, GHCR publishing            |
| [design_handoff_exercise_planner/](design_handoff_exercise_planner/README.md) | The original design spec and HTML prototype         |

Development history lives in [`journal/`](journal/).
