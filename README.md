# NEET Mock Test AI

[![CI](https://github.com/rnimriya/NIIT/actions/workflows/ci.yml/badge.svg)](https://github.com/rnimriya/NIIT/actions/workflows/ci.yml)

Production-grade, AI-native NEET preparation platform. Autonomous learning OS that plans, tutors, tests, revises, and predicts — built on Claude.

> **Status:** Foundation + working slices. This repo contains the full **architecture blueprint** ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), the monorepo **scaffold**, and runnable, DB-backed slices:
> - **AI tutor gateway** — Claude streaming + fallback chain + prompt caching, persists conversations
> - **Auth** — register/login/JWT (Clerk-ready), runs DB migrations
> - **Tests + Mastery** — seeded NEET bank → diagnostic → NEET scoring (+4/−1) → persisted per-concept mastery (EWMA)
> - **Prediction** — turns mastery into a predicted NEET score (/720), rank band, confidence, and the biggest score "levers"
> - **AI Planner** (`study`) — composes prediction → Claude → a persisted day-by-day study plan targeting the highest-leverage gaps (deterministic fallback)
> - **Payments + Entitlements** — Free/Plus/Pro tiers; Stripe checkout + webhook (with a zero-key dev-activation path). Entitlements actually gate behavior: free caps study-plan horizon and is served the Sonnet (not Opus) tutor
> - **Notifications** — in-app + email (Resend optional) with dedupe; emitted on test-scored / plan-ready / subscription-active
> - **Event bus (Kafka)** — optional, gated by `KAFKA_BROKERS`. When on, `tests` writes `TestScored` to a **transactional outbox** (atomic with the DB write) and a relay publishes it; `prediction` + `notifications` consume it (event-driven recompute + notify). When off, services fall back to direct HTTP. compose runs Redpanda
> - **Analytics (ClickHouse)** — consumes the Kafka event stream into ClickHouse + a `track` API; exposes overview + acquisition→activation funnel
> - **Web** — Next.js dashboard (live prediction), tutor chat, diagnostic, study-plan, plans/upgrade, notifications, and analytics-funnel UI
> - **Infra-as-code** — Terraform (VPC · EKS · RDS · ElastiCache · MSK · ECR) and a reusable Helm chart with per-service values; both `validate`/`lint`-checked in CI
> - **CI/CD** — every push: build + typecheck + HTTP/Kafka/ClickHouse smoke + IaC validate. On a `v*` tag: build & publish all 9 images to GHCR (`ghcr.io/<owner>/neet-ai/<service>`)

## Run the slices

Boots with **zero AI keys** (the tutor runs in deterministic mock mode). Set `ANTHROPIC_API_KEY` for real Claude responses. Auth + Tests persist to Postgres.

```bash
cp .env.example .env            # optional: add ANTHROPIC_API_KEY
pnpm install
docker compose -f infra/docker/docker-compose.yml up --build
#   web   → http://localhost:3000        (dashboard · tutor · diagnostic)
#   ai         → http://localhost:4001/readyz
#   auth       → http://localhost:4002/readyz
#   tests      → http://localhost:4003/readyz  (auto-seeds the question bank)
#   prediction → http://localhost:4004/readyz
#   study      → http://localhost:4005/readyz  (AI Planner)
#   payments   → http://localhost:4006/readyz  (entitlements; dev-activation if no Stripe key)
#   notifications → http://localhost:4007/readyz
#   analytics  → http://localhost:4008/readyz  (ClickHouse funnel)
```

**The learning loop, via API:**

```bash
TOKEN=$(curl -s -X POST localhost:4002/api/v1/auth/register \
  -H 'content-type: application/json' -d '{"email":"me@neet.ai"}' | jq -r .token)
# take a diagnostic → score it → mastery is saved and weak concepts surfaced
curl -s -X POST localhost:4003/api/v1/test/diagnostic -H "authorization: Bearer $TOKEN"
curl -s localhost:4003/api/v1/mastery -H "authorization: Bearer $TOKEN"
# predicted NEET score (/720), rank band, confidence, and improvement levers
curl -s localhost:4004/api/v1/prediction -H "authorization: Bearer $TOKEN"
# AI study plan: prediction levers → a day-by-day schedule (persisted)
# (free tier caps horizon to 3 days)
curl -s -X POST localhost:4005/api/v1/study/plan \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"horizonDays":7}'
# upgrade (dev path activates instantly without Stripe keys) → unlocks full horizon + Opus tutor
curl -s -X POST localhost:4006/api/v1/payments/checkout \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"plan":"pro"}'
curl -s localhost:4006/api/v1/entitlements -H "authorization: Bearer $TOKEN"
# the actions above emit notifications (test-scored, plan-ready, subscription-active)
curl -s localhost:4007/api/v1/notifications -H "authorization: Bearer $TOKEN"
```

Or run the AI gateway alone without Docker:

```bash
pnpm --filter @neet/types build
pnpm --filter @neet/ai build && node services/ai/dist/main.js
curl -N -X POST localhost:4001/api/v1/ai/chat \
  -H 'content-type: application/json' \
  -d '{"question":"Explain the photoelectric effect"}'
```

The gateway selects **Claude Opus 4.8** for hard doubts and **Sonnet 4.6** by default, caches the syllabus prompt prefix (1h TTL), and falls back Claude → OpenAI → mock.

## Stack

Next.js · Tailwind · ShadCN · NestJS · Drizzle · PostgreSQL · Redis · Kafka · Qdrant · ClickHouse · Cloudflare R2 · Clerk · **Claude (Opus 4.8 / Sonnet 4.6 / Haiku 4.5)** primary AI, OpenAI fallback.

## Monorepo layout

```
apps/      web · mobile · admin · api
services/  auth · users · study · tests · ai · analytics · payments · notifications
packages/  ui · types · config · sdk · shared
infra/     docker · k8s · terraform
docs/      ARCHITECTURE.md (16-phase blueprint)
scripts/   seed · migrate · codegen · load-test
```

## Documentation

The complete system design — domain model, topology, database schema, AI platform, security, observability, DevOps, cost model, and 90-day plan — lives in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Targets

API P95 < 250 ms · AI P95 < 4 s · Availability 99.95% · RPO < 15 m · RTO < 30 m · Scale to 1M+ MAU.
