# NEET Mock Test AI

Production-grade, AI-native NEET preparation platform. Autonomous learning OS that plans, tutors, tests, revises, and predicts — built on Claude.

> **Status:** Foundation + first runnable slice. This repo contains the full **architecture blueprint** ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), the monorepo **scaffold**, and a working **vertical slice**: the AI tutor gateway (Claude streaming + fallback + prompt caching) and a Next.js dashboard/chat, bootable via docker-compose.

## Run the vertical slice

Boots with **zero API keys** (the tutor runs in deterministic mock mode). Set `ANTHROPIC_API_KEY` for real Claude responses.

```bash
cp .env.example .env            # optional: add ANTHROPIC_API_KEY
pnpm install
docker compose -f infra/docker/docker-compose.yml up --build
#   web → http://localhost:3000        (dashboard + AI tutor chat)
#   ai  → http://localhost:4001/readyz (gateway health)
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
