#!/usr/bin/env bash
# End-to-end smoke test: boots all backend services against a Postgres and
# exercises the core loop, asserting expected behavior. Used by CI and locally.
#
#   DATABASE_URL=postgres://neet:neet@localhost:5432/neet bash scripts/smoke.sh
#
# Requires: built service dist (pnpm build), curl, python3, a running Postgres.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgres://neet:neet@localhost:5432/neet}"
export JWT_DEV_SECRET="${JWT_DEV_SECRET:-ci-secret}"
export AI_PORT=4001 AUTH_PORT=4002 TESTS_PORT=4003 PREDICTION_PORT=4004 \
  STUDY_PORT=4005 PAYMENTS_PORT=4006 NOTIFICATIONS_PORT=4007
export AI_URL=http://localhost:4001 PREDICTION_URL=http://localhost:4004 \
  PAYMENTS_URL=http://localhost:4006 NOTIFICATIONS_URL=http://localhost:4007

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT

fail() { echo "❌ SMOKE FAIL: $1"; [ -n "${2:-}" ] && tail -20 "/tmp/$2.log" 2>/dev/null; exit 1; }

start() { ( cd "$ROOT/services/$1" && exec node dist/main.js >"/tmp/$1.log" 2>&1 ) & pids+=($!); }

wait_ready() { # port name
  for _ in $(seq 1 60); do curl -sf "http://localhost:$1/readyz" >/dev/null 2>&1 && return 0; sleep 0.5; done
  fail "service $2 (:$1) not ready" "$2"
}

assert() { python3 -c "$1" || fail "$2"; }

echo "→ booting auth (migrations)…"
start auth; wait_ready 4002 auth

echo "→ booting remaining services…"
for s in tests prediction ai study payments notifications; do start "$s"; done
wait_ready 4003 tests; wait_ready 4004 prediction; wait_ready 4001 ai
wait_ready 4005 study; wait_ready 4006 payments; wait_ready 4007 notifications

echo "→ register"
TOKEN=$(curl -sf -X POST localhost:4002/api/v1/auth/register \
  -H 'content-type: application/json' -d '{"email":"ci@neet.ai"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])') || fail "register" auth
[ -n "$TOKEN" ] || fail "empty token"

echo "→ diagnostic + submit (scoring)"
DIAG=$(curl -sf -X POST localhost:4003/api/v1/test/diagnostic -H "authorization: Bearer $TOKEN")
TID=$(echo "$DIAG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["testId"])')
SUB=$(echo "$DIAG" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps({"responses":[{"questionId":q["id"],"selected":"a"} for q in d["questions"]]}))')
RES=$(curl -sf -X POST "localhost:4003/api/v1/test/$TID/submit" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$SUB")
echo "$RES" | assert 'import sys,json;d=json.load(sys.stdin);assert d["maxScore"]==24 and d["persisted"], d' "scoring"

echo "→ prediction reflects mastery"
curl -sf localhost:4004/api/v1/prediction -H "authorization: Bearer $TOKEN" \
  | assert 'import sys,json;d=json.load(sys.stdin);assert 0<=d["predictedScore"]<=720 and d["levers"], d' "prediction"

echo "→ free tier caps plan horizon to 3"
curl -sf -X POST localhost:4005/api/v1/study/plan -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"horizonDays":7}' \
  | assert 'import sys,json;d=json.load(sys.stdin);assert d["plan_tier"]=="free" and d["horizonDays"]==3, d' "free cap"

echo "→ upgrade to pro flips entitlements"
curl -sf -X POST localhost:4006/api/v1/payments/checkout -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"plan":"pro"}' >/dev/null
curl -sf localhost:4006/api/v1/entitlements -H "authorization: Bearer $TOKEN" \
  | assert 'import sys,json;d=json.load(sys.stdin);assert d["plan"]=="pro" and d["aiTutorOpus"], d' "entitlement"

echo "→ pro tier unlocks full horizon"
curl -sf -X POST localhost:4005/api/v1/study/plan -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"horizonDays":7}' \
  | assert 'import sys,json;d=json.load(sys.stdin);assert d["horizonDays"]==7, d' "pro horizon"

echo "→ notifications emitted"
sleep 1
curl -sf localhost:4007/api/v1/notifications -H "authorization: Bearer $TOKEN" \
  | assert 'import sys,json;d=json.load(sys.stdin);assert d["unread"]>=3, d' "notifications"

echo "✅ SMOKE OK — core loop verified end to end"
