# Deployment

> Purpose
>
> How the app is built into a container, what the container serves, and how CI publishes it.

## 1. Image

`Dockerfile` has two stages. The `node:22-alpine` stage installs npm 11, runs `npm ci`, and runs
`npm run build`, which type-checks before bundling. The runtime stage is
`nginxinc/nginx-unprivileged:1.29-alpine`, which runs as a non-root user on port **8080**.

```bash
docker build -t exercise-planner .
docker run -p 8080:8080 exercise-planner
```

## 2. nginx

`nginx.conf` serves `dist/`:

- `/assets/*`: hashed bundles, `Cache-Control: public, max-age=31536000, immutable`.
- `/index.html`: `no-cache`, so a new deploy takes effect on the next load.
- any other path falls back to `index.html`.
- `/healthz` returns `200 ok`; the image's `HEALTHCHECK` polls it.

## 3. CI and publishing

| Workflow | Trigger | Does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | pull request, push to `main` | lint, format check, type-check, tests with coverage, build |
| `.github/workflows/docker.yml` | pull request, push to `main` | builds the image; on `main` pushes it |

On push to `main`, `docker.yml` logs in to `ghcr.io` with `GITHUB_TOKEN` and pushes
`ghcr.io/johnmathews/exercise-planner` tagged `latest` and `sha-<short sha>`.

## 4. Data and hosting

All data lives in each browser's `localStorage`, keyed by origin. Moving the app to a new host or
port starts every browser with empty data. Clearing site data erases the log, and no server-side
copy exists. Sync is out of scope for now.
