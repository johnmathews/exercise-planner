# Multi-user: deployed, and the decisions recorded

The close of the multi-user build, written on 2026-10-24 around 08:46 CEST. W1–W4 and W6 merged
in this repo (#6–#10), and W5 in home-server (#245). This entry records the production deploy,
the decision record, and the final documentation audit.

## 1. Deployed

- The publish run for `587415f` (the W4 merge) succeeded for both images. Both images on infra-vm
  carry the `587415f` revision label. Confirmed.
- `make infra LIMIT=infra-vm t=fitness` ran from home-server `4118473` (#245): `failed=0`.
  - `/srv/infra/fitness` changed owner to 10001.
  - The compose file gained `fitness-api` and the internal `fitness` network.
  - `fitness` and `fitness-api` were recreated. Confirmed.
  - **The same run also restarted the timer, grafana, alloy and loki.** The role's "Ensure required
    directories exist" loop notifies `Restart {{ item.name }}`, and every item's handler fired when
    the fitness item changed. All were up again within seconds. Confirmed. The bug is in the role,
    not in #245; the home-server session working on infra-vm was told.
- Through Cloudflare, Traefik and nginx, all confirmed with curl:
  - `/healthz` and `/api/healthz` return 200.
  - API responses carry one `Cache-Control: no-store` and the unchanged CSP, with `cf-cache-status`
    showing `DYNAMIC`.
  - A write without `Origin` gets 403; `/api/state` without a session gets 401.
  - Two wrong-password logins got 401 `invalid`, and the container's memory then peaked at 108 MiB
    of 160 (43 idle), matching the measurement in `deployment.md`.
- `make prometheus` added the `/api/healthz` probe. `probe_success` reads 1 for both fitness
  targets. Confirmed.
- The database and its first daily backup exist under `/srv/infra/fitness`. An invite for `john`
  was minted. No other account exists.

## 2. Documentation

- **`docs/decisions.md`** records D1–D8 (settled in the discussion) and P1–P18 (made while
  building). Before it, the journals and PRs cited "D3" and "P7", but those IDs lived only in the
  gitignored run directory, which closing the run deletes. It is linked from the README and from
  `architecture.md`.
- **A fresh-eyes audit** of every living doc against the shipped code found no doc describing
  removed behaviour as current, and eleven gaps, all fixed:
  - The README's compose example would fail on first start: Docker creates the bind-mounted data
    directory as root, and the API runs as uid 10001.
  - `api.md`'s dev command used `127.0.0.1`, where Vite serves `localhost`, so every write would
    have been refused.
  - Missing pieces added: `ImportPrompt` in the component tree, the import-marker key, `problems.ts`
    and `importSummary.ts`, the API test inventory, the username rule, the item-id length, the
    busy queue's true size, link revocation per kind, and a disabled user's login.

## 3. What is deliberately not done

- **No production test account.** The deploy was checked with requests that create nothing. A
  real sign-up, sync and import was exercised in Playwright against the same images with
  throwaway data, and by `compose-smoke.sh` in CI, not on the live site.
- **The role's handler fan-out is not fixed here.** It belongs to the home-server repo and to the
  session that owns `infra_vm` today.
- **The DNS fallback is accepted, not pinned.** The internal network limits who can reach the API,
  but the web container still sits on the default network, so an unresolved `fitness-api` lookup
  still goes upstream for the seconds of an API restart. Pinning an address would mean templating
  the upstream into the web image (`decisions.md` §4).
- **John's data from the 5173 dev origin** held only the default plan when exported. Where any
  older log lives, if anywhere, is unknown. The first-login prompt offers it from whichever browser
  holds it.
