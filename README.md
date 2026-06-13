# NEET Mock Test AI

Production-grade, AI-native NEET preparation platform. Autonomous learning OS that plans, tutors, tests, revises, and predicts — built on Claude.

> **Status:** Foundation + working slices. This repo contains the full **architecture blueprint** ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), the monorepo **scaffold**, and runnable, DB-backed slices:
> - **AI tutor gateway** — Claude streaming + fallback chain + prompt caching, persists conversations
> - **Auth** — register/login/JWT (Clerk-ready), runs DB migrations
> - **Tests + Mastery** — seeded NEET bank → diagnostic → NEET scoring (+4/−1) → persisted per-concept mastery (EWMA)
> - **Web** — Next.js dashboard, tutor chat, and diagnostic test UI

## Run the slices

Boots with **zero AI keys** (the tutor runs in deterministic mock mode). Set `ANTHROPIC_API_KEY` for real Claude responses. Auth + Tests persist to Postgres.

```bash
cp .env.example .env            # optional: add ANTHROPIC_API_KEY
pnpm install
docker compose -f infra/docker/docker-compose.yml up --build
#   web   → http://localhost:3000        (dashboard · tutor · diagnostic)
#   ai    → http://localhost:4001/readyz
#   auth  → http://localhost:4002/readyz
#   tests → http://localhost:4003/readyz  (auto-seeds the question bank)
```

**The learning loop, via API:**

```bash
TOKEN=$(curl -s -X POST localhost:4002/api/v1/auth/register \
  -H 'content-type: application/json' -d '{"email":"me@neet.ai"}' | jq -r .token)
# take a diagnostic → score it → mastery is saved and weak concepts surfaced
curl -s -X POST localhost:4003/api/v1/test/diagnostic -H "authorization: Bearer $TOKEN"
curl -s localhost:4003/api/v1/mastery -H "authorization: Bearer $TOKEN"
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
