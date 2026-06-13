#!/usr/bin/env bash
# Analytics smoke: a TestScored event flows outbox → Kafka → analytics consumer
# → ClickHouse, and shows up in the overview/funnel. Also checks /track.
# Requires: built dist, curl, python3, Postgres + Kafka + ClickHouse running.
#
#   DATABASE_URL=... KAFKA_BROKERS=localhost:9092 CLICKHOUSE_URL=http://localhost:8123 \
#     bash scripts/smoke-analytics.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="${DATABASE_URL:-postgres://neet:neet@localhost:5432/neet}"
export KAFKA_BROKERS="${KAFKA_BROKERS:-localhost:9092}"
export CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
export JWT_DEV_SECRET="${JWT_DEV_SECRET:-ci-secret}"
export AUTH_PORT=4002 TESTS_PORT=4003 ANALYTICS_PORT=4008

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT
fail() { echo "❌ ANALYTICS SMOKE FAIL: $1"; for s in tests analytics; do echo "--- $s ---"; tail -15 "/tmp/$s.log" 2>/dev/null; done; exit 1; }
start() { ( cd "$ROOT/services/$1" && exec node dist/main.js >"/tmp/$1.log" 2>&1 ) & pids+=($!); }
wait_ready() { for _ in $(seq 1 80); do curl -sf "http://localhost:$1/readyz" >/dev/null 2>&1 && return 0; sleep 0.5; done; fail "service $2 (:$1) not ready"; }
wait_log() { for _ in $(seq 1 120); do grep -q "$2" "/tmp/$1.log" 2>/dev/null && return 0; sleep 0.5; done; fail "$1 never logged '$2'"; }

echo "→ auth (migrations)"; start auth; wait_ready 4002 auth
echo "→ tests (outbox) + analytics (ClickHouse sink)"
start tests; start analytics
wait_ready 4003 tests
wait_ready 4008 analytics
wait_log analytics "subscribed to assessment.events"

echo "→ register + track signup"
TOKEN=$(curl -sf -X POST localhost:4002/api/v1/auth/register -H 'content-type: application/json' -d '{"email":"analytics@neet.ai"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
[ -n "$TOKEN" ] || fail "no token"
curl -sf -X POST localhost:4008/api/v1/analytics/track -H 'content-type: application/json' -d '{"type":"signup","source":"web"}' >/dev/null

echo "→ diagnostic + submit (emits TestScored through the outbox)"
DIAG=$(curl -sf -X POST localhost:4003/api/v1/test/diagnostic -H "authorization: Bearer $TOKEN")
TID=$(echo "$DIAG" | python3 -c 'import sys,json;print(json.load(sys.stdin)["testId"])')
SUB=$(echo "$DIAG" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps({"responses":[{"questionId":q["id"],"selected":"a"} for q in d["questions"]]}))')
curl -sf -X POST "localhost:4003/api/v1/test/$TID/submit" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$SUB" >/dev/null

echo "→ awaiting ClickHouse sink (overview shows TestScored + signup)"
ok=0
for i in $(seq 1 30); do
  OUT=$(curl -sf localhost:4008/api/v1/analytics/overview 2>/dev/null)
  HAS=$(echo "$OUT" | python3 -c 'import sys,json
d={r["type"]:r["count"] for r in json.load(sys.stdin)}
print("yes" if d.get("TestScored",0)>=1 and d.get("signup",0)>=1 else "no")' 2>/dev/null)
  echo "  [$i] overview=$OUT → $HAS"
  if [ "$HAS" = "yes" ]; then ok=1; break; fi
  sleep 1
done
[ "$ok" = "1" ] || fail "events did not reach ClickHouse in time"

echo "→ funnel"
curl -sf localhost:4008/api/v1/analytics/funnel | python3 -c 'import sys,json
f={r["stage"]:r["count"] for r in json.load(sys.stdin)}
assert f.get("TestScored",0)>=1, f
print("funnel:",f)' || fail "funnel"

echo "✅ ANALYTICS SMOKE OK — events reach ClickHouse and surface in overview/funnel"
