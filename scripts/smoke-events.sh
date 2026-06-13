#!/usr/bin/env bash
# Event-driven smoke test: with Kafka enabled, a TestScored event must drive
# prediction recompute + a notification — WITHOUT any HTTP /recompute or emit.
# Requires: built dist, curl, python3, a running Postgres AND Kafka broker.
#
#   DATABASE_URL=... KAFKA_BROKERS=localhost:9092 bash scripts/smoke-events.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgres://neet:neet@localhost:5432/neet}"
export KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"
export JWT_DEV_SECRET="${JWT_DEV_SECRET:-ci-secret}"
export AUTH_PORT=4002 TESTS_PORT=4003 PREDICTION_PORT=4004 NOTIFICATIONS_PORT=4007

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT
fail() { echo "❌ EVENTS SMOKE FAIL: $1"; for s in tests prediction notifications; do echo "--- $s ---"; tail -15 "/tmp/$s.log" 2>/dev/null; done; exit 1; }
start() { ( cd "$ROOT/services/$1" && exec node dist/main.js >"/tmp/$1.log" 2>&1 ) & pids+=($!); }
wait_ready() { for _ in $(seq 1 60); do curl -sf "http://localhost:$1/readyz" >/dev/null 2>&1 && return 0; sleep 0.5; done; fail "service $2 (:$1) not ready"; }
wait_log() { for _ in $(seq 1 120); do grep -q "$2" "/tmp/$1.log" 2>/dev/null && return 0; sleep 0.5; done; fail "$1 never logged '$2'"; }

echo "→ auth (migrations)"; start auth; wait_ready 4002 auth
echo "→ tests + event consumers (prediction, notifications)"
for s in tests prediction notifications; do start "$s"; done
wait_ready 4003 tests
wait_log prediction "subscribed to assessment.events"
wait_log notifications "subscribed to assessment.events"

echo "→ register"
REG=$(curl -sf -X POST localhost:4002/api/v1/auth/register -H 'content-type: application/json' -d '{"email":"event@neet.ai"}')
TOKEN=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
USERID=$(echo "$REG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["id"])')
[ -n "$TOKEN" ] || fail "no token"

echo "→ diagnostic + submit (publishes TestScored; no /recompute, no http emit)"
DIAG=$(curl -sf -X POST localhost:4003/api/v1/test/diagnostic -H "authorization: Bearer $TOKEN")
TID=$(echo "$DIAG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["testId"])')
SUB=$(echo "$DIAG" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps({"responses":[{"questionId":q["id"],"selected":"a"} for q in d["questions"]]}))')
curl -sf -X POST "localhost:4003/api/v1/test/$TID/submit" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$SUB" >/dev/null

echo "→ awaiting event-driven effects (prediction recompute + notification)"
ok=0
for i in $(seq 1 30); do
  PRED=$(curl -sf localhost:4004/api/v1/prediction -H "authorization: Bearer $TOKEN" 2>/dev/null \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print("yes" if "predictedScore" in d else "no")' 2>/dev/null)
  NOTIF=$(curl -sf localhost:4007/api/v1/notifications -H "authorization: Bearer $TOKEN" 2>/dev/null \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["unread"])' 2>/dev/null)
  echo "  [$i] prediction=$PRED notifications_unread=${NOTIF:-0}"
  if [ "$PRED" = "yes" ] && [ "${NOTIF:-0}" != "0" ]; then ok=1; break; fi
  sleep 1
done
[ "$ok" = "1" ] || fail "event-driven effects not observed in time"

echo "✅ EVENTS SMOKE OK — TestScored drove prediction + notification via Kafka"
