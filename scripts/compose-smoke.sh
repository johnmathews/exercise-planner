#!/usr/bin/env bash
# End-to-end check of both images behind nginx, as production runs them (docs/deployment.md).
# Builds and starts docker-compose.yml, signs a user up through the /api proxy, writes and reads
# data, checks the write guard, then stops the API and checks nginx still serves the app.
# Used by CI (docker.yml) and runnable locally. Leaves nothing running.
set -euo pipefail

BASE=http://localhost:8083
ORIGIN=http://localhost:8083
JAR=$(mktemp)
PROJECT=ep-smoke

compose() { docker compose -p "$PROJECT" "$@"; }
cleanup() { compose down -v --remove-orphans >/dev/null 2>&1 || true; rm -f "$JAR"; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; compose logs --tail 50 >&2 || true; exit 1; }
expect_status() { # expect_status <want> <curl args...>
  local want=$1; shift
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  [ "$got" = "$want" ] || fail "expected $want, got $got for: $*"
}
post() { curl -s -b "$JAR" -c "$JAR" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' "$@"; }

compose up -d --build --wait --wait-timeout 120
echo "stack up"

expect_status 200 "$BASE/"
[ "$(curl -s "$BASE/api/healthz")" = '{"ok":true}' ] || fail "healthz through nginx"
cc=$(curl -s -D - -o /dev/null "$BASE/api/healthz" | grep -ci '^cache-control: no-store')
[ "$cc" = 1 ] || fail "expected exactly one Cache-Control: no-store on /api/, got $cc"

token=$(compose exec -T fitness-api fp-admin invite smoke | sed -n 's|.*/#/invite/||p')
[ -n "$token" ] || fail "no invite token"
body=$(printf '{"token":"%s","password":"correct horse battery"}' "$token")
[ "$(post -d "$body" "$BASE/api/invites/redeem")" = '{"username":"smoke"}' ] || fail "redeem through nginx"
post -X PUT -d '{"done":true}' "$BASE/api/ticks/exercise/2026-10-19/pu/0" | grep -q '"days":\[true' \
  || fail "tick through nginx"
curl -s -b "$JAR" "$BASE/api/state" | grep -q '"pu":\[true' || fail "state through nginx"
expect_status 403 -b "$JAR" -X PUT -H 'Origin: http://evil.example' -H 'Content-Type: application/json' \
  -d '{"done":true}' "$BASE/api/ticks/exercise/2026-10-19/pu/1"
echo "sign-up, write, read and the origin check work through nginx"

compose stop fitness-api >/dev/null
# 502 when the address is refused, 504 when nginx's cached address times out (3 s): the client
# treats both as offline. Either way it must answer quickly, not after nginx's default 60 s.
down=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/healthz")
case "$down" in 502 | 504) ;; *) fail "expected 502 or 504 with the API down, got $down" ;; esac
expect_status 200 "$BASE/"
echo "with the API down, /api/ answers $down quickly and nginx still serves the app"
echo "OK"
