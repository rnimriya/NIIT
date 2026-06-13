# NEET Mock Test AI

Production-grade, AI-native NEET preparation platform. Autonomous learning OS that plans, tutors, tests, revises, and predicts — built on Claude.

> **Status:** Foundation. This repo currently contains the full **architecture blueprint** ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) and the monorepo **scaffold**. Service implementation (Phase 14) is in progress.

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
