# Deployment

> Purpose
>
> How the app is built into a container, what the container serves, and how CI publishes it.

## 1. Image

`Dockerfile` has two stages. The `node:22-alpine` stage installs npm 11, runs `npm ci`, and runs
`npm run build`, which fails on a type error or a bundling error. The runtime stage is
`nginxinc/nginx-unprivileged:1.29-alpine`, which runs as the non-root `nginx` user (uid 101) on
port **8080**. `.dockerignore` keeps `node_modules`, `dist`, `.git`, `.github`, `docs`, `journal`
and the design handoff out of the build context.

```bash
docker build -t exercise-planner .
docker run -p 8080:8080 exercise-planner
```

## 2. nginx

`nginx.conf` serves `dist/`:

- `/assets/*`: hashed bundles with `Cache-Control: public, max-age=31536000, immutable`; a missing
  asset returns 404 rather than falling back.
- Everything else gets `Cache-Control: no-cache`, so a new deploy takes effect on the next load.
  Unknown paths fall back to `index.html`.
- `/healthz` returns `200 ok`; the image's `HEALTHCHECK` polls it with BusyBox `wget`.
- Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a
  Content-Security-Policy of `default-src 'self'`. `style-src` allows `'unsafe-inline'` because
  Vue binds the accent and swatch colours as inline styles.
- gzip compresses CSS, JavaScript and SVG.

All headers are set once at server level through a `map` on `$uri`. A `location` that declared
its own `add_header` would silently drop the inherited ones.

## 3. CI and publishing

| Workflow                       | Trigger                      | Does                                                       |
| ------------------------------ | ---------------------------- | ---------------------------------------------------------- |
| `.github/workflows/ci.yml`     | pull request, push to `main` | lint, format check, type-check, tests with coverage, build |
| `.github/workflows/docker.yml` | pull request, push to `main` | `build` job on PRs; `publish` job on `main`                |

The `build` job builds the image without pushing and holds only `contents: read`. The `publish`
job is the only one granted `packages: write`. It logs in to `ghcr.io` with `GITHUB_TOKEN` and
pushes `ghcr.io/johnmathews/exercise-planner` tagged `latest` and `sha-<short sha>`. Every
checkout sets `persist-credentials: false`.

## 4. Data and hosting

All data lives in each browser's `localStorage`, keyed by origin. Moving the app to a new host or
port starts every browser with empty data. Clearing site data erases the log, and no server-side
copy exists. Sync is out of scope for now.
