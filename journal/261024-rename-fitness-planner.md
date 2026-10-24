# Renamed from exercise-planner to fitness-planner

> Purpose
>
> Records the project's rename on 2026-10-24: what changed, what was migrated rather than renamed
> outright, and what was left under the old name on purpose.

## 1. Why

The app plans food as well as exercise, and its deployment was already `fitness` (the
`fitness.itsa-pizza.com` host, the `fitness-api` service, `fitness.db`). The local directory moved
to `fitness-planner` first, and this change brings the rest of the project's names into line.

## 2. Renamed outright

- The Python package, `exercise_planner_api` → `fitness_planner_api`, and the distribution,
  `exercise-planner-api` → `fitness-planner-api` (`pyproject.toml`, `uv.lock`, `api/Dockerfile`,
  the CI arm64 import check).
- The admin CLI, `ep-admin` → `fp-admin`, in the image, the compose smoke test and the docs.
- The npm package name, the README title, docs, and the import error message ("That file isn't a
  Fitness Planner export").
- The export download, now `fitness-planner-YYYY-MM-DD.json` (`app.py` sends the same name).
- The images, now `ghcr.io/johnmathews/fitness-planner` and `fitness-planner-api`, and the GitHub
  repo, renamed with `gh repo rename` after the merge. GitHub redirects the old URL.

## 3. Migrated rather than renamed

Users never see the localStorage keys and the export format string, but data already saved under
them depends on those names, so each one moved with a migration:

- **localStorage keys.** `migrateKeyPrefix` (`src/lib/storage.ts`) runs in `src/main.ts` before the
  stores start and moves every `exercise-planner-…` key to `fitness-planner-…`. That includes the
  outbox, so unsent writes survive the deploy. A value already under the new name wins. A failed
  copy keeps the old key, so the next load retries. `public/theme-init.js` runs first, so it falls
  back to the old settings key.
- **Export format.** New files say `fitness-planner-export`. `OLD_EXPORT_FORMAT` in
  `src/lib/transfer.ts` and `validate.py` keeps older files importing. The shared fixture
  `fixtures/transfer/parse/old-format.json` holds both languages to it.

## 4. Left alone

- The journal and `design_handoff_exercise_planner/`, which record history under the name it had.
- The home-server repo, whose compose template still pulls `exercise-planner`. Infra-vm keeps
  running the last old-name build until that template moves to the new image names.
