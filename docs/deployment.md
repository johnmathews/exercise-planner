# Deployment

> Purpose
>
> How the app and its API are built into containers, what they serve, and how CI publishes them.

## 1. Image

`Dockerfile` has two stages. The `node:22-alpine` stage installs npm 11, runs `npm ci`, and runs
`npm run build`, which fails on a type error or a bundling error. It is pinned to `$BUILDPLATFORM`:
static files are identical for every target, so it runs once, natively. The runtime stage is
`nginxinc/nginx-unprivileged:1.29-alpine`, which runs as the non-root `nginx` user (uid 101) on port
**8080**. `.dockerignore` keeps dependencies, build output, git and CI metadata, docs, the journal,
the design handoff, local tooling directories, `api/` and `fixtures/` out of the build context.

The image is multi-architecture (`linux/amd64`, `linux/arm64`). Only the runtime stage is assembled
per target, and it holds nothing but `COPY` steps, so no QEMU emulation is needed.

```bash
docker build -t fitness-planner .        # host architecture, loaded locally
docker run -p 8080:8080 fitness-planner
```

To check both platforms build, run
`docker buildx build --platform linux/amd64,linux/arm64 -t fitness-planner .`. A multi-platform
result stays in the build cache unless the builder supports loading it (Docker Desktop with the
containerd image store) or `--push` sends it to a registry.

**The API image** (`api/Dockerfile`, context `api/`) also builds without QEMU. Its build stage
runs on the build machine's platform and has uv install the locked dependencies as wheels for the
target (`x86_64-` or `aarch64-manylinux_2_28`). Every dependency ships binary wheels for both,
so nothing compiles. The runtime stage is `python:3.13-slim`, running as uid 10001 with `/data`
as its volume and uvicorn on port **8000**. `fp-admin` is on the `PATH`, and the `HEALTHCHECK`
calls `/api/healthz` with Python's `urllib` (the slim image has no curl).

**Memory.** Measured on the API image on 2026-10-24 by reading the container's
`memory.peak` cgroup file:

| State                                              | Peak    |
| -------------------------------------------------- | ------- |
| idle after start                                   | 43 MiB  |
| one argon2 hash (invite redemption)                | 107 MiB |
| three sequential logins, then four concurrent ones | 109 MiB |

The four concurrent logins finished at 37, 67, 95 and 123 ms. The hashing semaphore runs them one
after another, so the peak stays at one hash's 64 MiB. Give the API **`mem_limit: 160m`**. The web
container's 64m would be killed by the first login.

`docker compose up --build` runs both images locally: the app on `http://localhost:8083` and the API
on `http://localhost:8000`, with the API's data in the `api-data` volume. Mint a first invite with
`docker compose exec fitness-api fp-admin invite <name>`.

## 2. nginx

`nginx.conf` serves `dist/` and proxies the API:

- `/api/*`: forwarded to `fitness-api:8000`, the API container, on the same Docker network. The
  upstream is a variable resolved through Docker's DNS (`resolver 127.0.0.11`), so nginx starts and
  keeps serving the app while the API is down. `/api/` then answers 502, or 504 within 3 seconds
  while nginx still holds the stopped container's address (`proxy_connect_timeout 3s`); the client
  treats both as offline. Bodies are capped at 1 MiB, as the API caps them. The API's own `Cache-Control` is
  hidden and the server-level `no-store` sent instead, so each response carries exactly one.
- `/assets/*`: hashed bundles with `Cache-Control: public, max-age=31536000, immutable`; a missing
  asset returns 404 rather than falling back.
- Everything else gets `Cache-Control: no-cache`, so a new deploy takes effect on the next load.
  Unknown paths fall back to `index.html`.
- `/healthz` returns `200 ok`; the image's `HEALTHCHECK` polls it with BusyBox `wget`.
- Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a
  Content-Security-Policy of `default-src 'self'`. `style-src` allows `'unsafe-inline'` because Vue
  binds the accent and swatch colours as inline styles.
- gzip compresses HTML, CSS, JavaScript and SVG.

All headers are set once at server level; `Cache-Control` varies through a `map` on `$uri`. A
`location` that declared its own `add_header` would silently drop the inherited ones.

## 3. CI and publishing

| Workflow                       | Trigger                      | Does                                                                                                           |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | pull request, push to `main` | `check`: lint, format, types, tests with coverage, build. `api`: ruff, mypy, pytest with coverage, `pip-audit` |
| `.github/workflows/docker.yml` | pull request, push to `main` | `build` and `compose` on PRs; `publish` on `main`; build and publish run once per image                        |

`build` and `publish` build `linux/amd64` and `linux/arm64` for each image, so a PR proves the
multi-arch build before `main` publishes it; `compose` builds for the runner's own architecture. For the API, the PR build also smoke-tests each architecture: the amd64
image must answer `/api/healthz`, and the arm64 image, run under QEMU, must import its native
modules. The `build` job builds without pushing and holds only `contents: read`. The `publish` job
is the only one granted `packages: write`. It logs in to `ghcr.io` with `GITHUB_TOKEN` and pushes
`ghcr.io/johnmathews/fitness-planner` and `ghcr.io/johnmathews/fitness-planner-api`, each tagged
`latest` and `sha-<short sha>`. Every checkout sets `persist-credentials: false`. Before
2026-10-24 the project was called exercise-planner and published `exercise-planner` and
`exercise-planner-api`. Those images still exist but no longer update, so a host must pull the new
names.

## 4. Data and hosting

Each user's data lives in the API's SQLite database (`api.md` §2), backed up daily with
`VACUUM INTO` and by PBS. Each browser keeps a per-user cache in `localStorage` so the app opens
instantly and works offline (`architecture.md` §7). Moving to a new hostname now only costs that
cache: signing in again fetches everything from the server. Settings → Export still saves a JSON
copy of one person's data.

The web container must reach the API as `fitness-api` on a shared Docker network: `nginx.conf`
names that host. `docker-compose.yml` does this locally, and the home-server compose file does it
in production.

`scripts/compose-smoke.sh` builds and starts both images with `docker-compose.yml` and checks the
whole path through nginx:

- a user signs up from an `fp-admin` invite, writes a tick and reads it back;
- a write from a foreign `Origin` gets 403;
- with the API stopped, `/api/` answers 502 or 504 within seconds while nginx still serves the app.

CI runs it on every pull request (the `compose` job in `docker.yml`); locally it takes about a
minute and leaves nothing running.
