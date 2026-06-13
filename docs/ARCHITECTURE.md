# NEET Mock Test AI — Production Architecture

**Status:** Foundational blueprint (v1.0)
**Owner:** Platform / CTO
**Stack anchor:** Prompt stack (NestJS · Drizzle · PostgreSQL · Redis · Kafka · Next.js · Cloudflare R2 · Clerk) with **Claude as primary AI** (Opus 4.8 / Sonnet 4.6 / Haiku 4.5), OpenAI as fallback.
**Targets:** API P95 < 250 ms · AI P95 < 4 s · Availability 99.95% · RPO < 15 m · RTO < 30 m
**Scale path:** 10K → 100K → 1M+ MAU · 200K peak concurrent.

Every architecture decision below carries: **WHY · SCALING LIMIT · UPGRADE PATH · FAILURE MODE · OPERATING COST.** Decisions favor **Simple → Reliable → Scalable**, with explicit upgrade triggers so we don't over-build at launch.

---

## Table of Contents

1. [Phase 1 — Product & Domain Model](#phase-1)
2. [Phase 2 — System Architecture](#phase-2)
3. [Phase 3 — Repository Structure](#phase-3)
4. [Phase 4 — Component Design](#phase-4)
5. [Phase 5 — Data Flow](#phase-5)
6. [Phase 6 — Database](#phase-6)
7. [Phase 7 — API Design](#phase-7)
8. [Phase 8 — Caching](#phase-8)
9. [Phase 9 — Event Architecture](#phase-9)
10. [Phase 10 — AI Platform](#phase-10)
11. [Phase 11 — Security](#phase-11)
12. [Phase 12 — Observability](#phase-12)
13. [Phase 13 — DevOps](#phase-13)
14. [Phase 14 — Implementation](#phase-14)
15. [Phase 15 — Scale & Cost](#phase-15)
16. [Phase 16 — Execution](#phase-16)

---

<a name="phase-1"></a>
## PHASE 1 — PRODUCT & DOMAIN MODEL

### 1.1 Business Architecture

NEET Mock Test AI is an **autonomous exam-prep operating system**. The product thesis: a NEET aspirant should never have to decide *what to study next, how to revise, or where they stand* — the AI runs the loop. Humans (students, parents) supply intent and effort; the platform supplies planning, generation, assessment, diagnosis, and prediction.

Revenue: B2C subscription (Freemium → Plus → Pro), with a future B2B2C coaching-institute tier. The economic engine is **AI-driven retention**: the score predictor and adaptive revision create a measurable "rank delta" the student can see, which is what converts and retains.

**Value loop (the core flywheel):**

```
Student studies → attempts generated → mistakes captured →
revision queue rebuilt → score re-predicted → plan re-optimized →
student studies the highest-leverage topic next → (repeat)
```

### 1.2 Bounded Contexts (DDD)

Each bounded context maps to one deployable service. Boundaries are drawn on **rate of change** and **data ownership**, not on nouns.

| Bounded Context | Core Responsibility | Owns (source of truth) | Consumes |
|---|---|---|---|
| **Identity & Access** | Auth, roles, sessions, parent-child links | `users`, `parent_links`, RBAC | Clerk (IdP) |
| **Learner Profile** | Profile, goals, exam target, preferences | `profiles`, `goals` | Identity |
| **Catalog (Content)** | NEET syllabus graph, chapters, concepts, question bank | `subjects`, `chapters`, `concepts`, `questions` | — |
| **Study & Planning** | Study plans, sessions, scheduling, AI Planner | `study_plans`, `study_sessions` | Catalog, Mastery |
| **Assessment (Testing)** | Test assembly, attempts, scoring, AI Test Generator | `tests`, `attempts`, `responses` | Catalog, AI |
| **Mastery & Diagnostics** | Per-concept mastery, mistakes, spaced repetition | `mastery`, `mistakes`, `revision_queue` | Assessment events |
| **Prediction** | Score/rank prediction model | `predictions` | Mastery, Assessment |
| **Tutoring** | AI Tutor chat, AI Doubt Solver | `conversations`, `messages` | AI, Catalog |
| **Engagement** | Notifications, streaks, nudges | `notifications`, `streaks` | all events |
| **Billing** | Subscriptions, entitlements, invoices | `subscriptions`, `payments`, `entitlements` | Stripe |
| **Analytics** | Behavioral + learning analytics | ClickHouse event store | all events |
| **AI Platform** | Gateway, routing, RAG, memory, cost control | prompt registry, embeddings (Qdrant) | Claude/OpenAI |
| **Admin** | Content ops, moderation, ops console | audit views | all |

### 1.3 Context Map (relationships)

```
                         ┌──────────────┐
                         │  Identity    │ (upstream — everyone conforms)
                         └──────┬───────┘
                                │ ACL
        ┌───────────────┬───────┴────────┬─────────────────┐
        ▼               ▼                ▼                 ▼
  ┌──────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
  │ Learner  │   │  Study &   │   │ Assessment │   │  Billing   │
  │ Profile  │   │  Planning  │◄──┤            │   │ (Stripe    │
  └────┬─────┘   └─────┬──────┘   └─────┬──────┘   │  conformist)│
       │               │ Customer/      │           └────────────┘
       │               │ Supplier       │ publishes events
       │               ▼                ▼
       │         ┌────────────────────────────┐
       │         │   Mastery & Diagnostics     │ (event consumer / SOR)
       │         └─────────────┬──────────────┘
       │                       │
       │                       ▼
       │                ┌────────────┐      ┌────────────┐
       └───────────────►│ Prediction │      │ Tutoring   │
                        └─────┬──────┘      └─────┬──────┘
                              │                   │
                              ▼                   ▼
                        ┌────────────────────────────────┐
                        │        AI Platform (Shared      │
                        │        Kernel for prompts/RAG)  │
                        └────────────────────────────────┘
   All contexts ───────► Analytics (ClickHouse, async, lossy-tolerant)
```

- **Identity** is upstream of everything (Conformist relationship via Clerk).
- **Billing** is a Conformist to Stripe; the rest of the system reads **entitlements**, never Stripe directly.
- **Mastery** is the System of Record for "what the student knows" — fed by Assessment events. This is the single most valuable data asset.
- **AI Platform** is a **Shared Kernel** (prompt templates, RAG, routing) consumed by Planning, Testing, Tutoring, Prediction.
- **Analytics** is downstream of all, async, and tolerant of loss.

### 1.4 User Roles & Capabilities

| Role | Capabilities |
|---|---|
| **Student** | Study sessions, take/generate tests, AI tutor/doubt, view predictions/analytics, manage own profile |
| **Parent** | View linked child's progress, predictions, attendance/streaks (read-only); receive digests. **No** access to chat content (privacy boundary) |
| **Content Admin** | CRUD syllabus graph + question bank, approve AI-generated questions, manage difficulty calibration |
| **Support/Ops** | Read user state, impersonate (audited), refund triggers, resend notifications |
| **Super Admin** | Feature flags, model routing config, cost caps, RBAC management |
| **System (service accounts)** | Inter-service calls, scheduled jobs, AI workers |

### 1.5 Critical User Journeys

1. **Onboarding → first plan** (≤ 60 s perceived): signup (Clerk) → diagnostic mini-test (15 Q) → AI Planner emits a 30/90-day plan → dashboard.
2. **Daily study loop**: open dashboard → "today's focus" (3 concepts) → study session → micro-quiz → mistakes captured → revision queue updated.
3. **Full mock test**: generate adaptive 180-Q NEET mock → 3h timed attempt (autosave) → instant scoring → per-subject diagnostics → rank prediction → revision tasks.
4. **Doubt solving**: snap a question (image) → AI Doubt Solver (OCR + RAG) → step-by-step solution + linked concept + "add to revision".
5. **Revision**: spaced-repetition queue surfaces due concepts → AI generates fresh variant questions → re-test → mastery re-scored.
6. **Prediction check**: student/parent views predicted NEET score + rank band + confidence + "to gain +30 marks, master these 5 chapters".
7. **Upgrade**: hits Free quota (e.g., 1 mock/week) → paywall → Stripe checkout → entitlements flip live.

### 1.6 Failure Scenarios (designed-for)

| Scenario | Designed Response |
|---|---|
| AI provider outage (Claude) | Fallback to OpenAI; if both down, serve cached/pre-generated tests + degraded tutor ("try later") |
| Mid-test crash / network loss | Client-side autosave every 5 s + server idempotent response upsert; resume from last saved index |
| Payment webhook lost/duplicated | Idempotent webhook handler keyed on Stripe event ID; reconciliation cron |
| Question bank gap for a topic | AI Test Generator synthesizes (flagged "AI-generated, pending review"); never block the student |
| Prediction model drift | Shadow-score against real NEET results post-season; auto-retrain trigger; confidence intervals widen |
| Hot-key (viral mock shared) | Edge cache + Redis read-through; pre-generated "official" mocks |
| Thundering herd at result release | Queue + backpressure; results computed async with "we'll notify you" |

---

<a name="phase-2"></a>
## PHASE 2 — SYSTEM ARCHITECTURE

### 2.1 Layered Topology (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER   Web (Next.js)  │  Mobile (Expo/RN)  │  Admin (Next.js)      │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ HTTPS / WSS
┌───────────────▼───────────────────────────────────────────────────────────┐
│ CDN + EDGE     Cloudflare (CDN, WAF, DDoS, Bot mgmt, edge cache, TLS)        │
│                Static assets + R2 media + edge rate-limit                     │
└───────────────┬───────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────┐
│ API GATEWAY    Kong / Cloudflare Gateway → AuthN(JWT/Clerk) · rate-limit ·   │
│                routing · request-id · GraphQL gateway (BFF) · WS gateway      │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ mTLS (internal)
┌───────────────▼───────────────────────────────────────────────────────────┐
│ APPLICATION LAYER (NestJS services, K8s)                                     │
│  auth · users · study · tests · ai · analytics · payments · notifications    │
└───┬──────────────┬───────────────┬──────────────────┬───────────────────────┘
    │              │               │                  │
    │              │        ┌──────▼──────┐    ┌───────▼────────┐
    │              │        │ AI LAYER     │    │ QUEUE LAYER     │
    │              │        │ AI Gateway   │    │ Kafka (events)  │
    │              │        │ Router/RAG   │    │ BullMQ (jobs)   │
    │              │        │ Claude/OpenAI│    └───────┬─────────┘
    │              │        └──────┬───────┘            │
┌───▼──────────────▼───────────────▼────────────────────▼─────────────────────┐
│ DATA LAYER                                                                    │
│  PostgreSQL (primary + read replicas, partitioned)  │ Redis (cache/sessions) │
│  Qdrant (vectors/RAG)  │  ClickHouse (analytics)    │ Cloudflare R2 (blobs)  │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ OBSERVABILITY  OpenTelemetry → Prometheus/Grafana · Loki · Tempo · Sentry      │
│ SECURITY       Clerk · Vault/Doppler secrets · WAF · audit log · KMS           │
│ INFRA          AWS (EKS, RDS, MSK/Kafka, ElastiCache) · Terraform · ArgoCD     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**WHY this shape:** Stateless app tier behind an edge that absorbs the read-heavy, spiky traffic typical of exam prep (everyone studies 7–11pm; result-day spikes). AI is isolated behind a gateway so cost/latency/failover are controlled in one place. Events (Kafka) decouple the write-heavy learning loop from the read-heavy dashboards.

**SCALING LIMIT:** Single-region Postgres primary write ceiling (~tens of K writes/s with the partitioning in Phase 6). **UPGRADE PATH:** read replicas → table partitioning → Citus/horizontal sharding by `user_id` at ~1M MAU. **FAILURE MODE:** AZ loss → multi-AZ RDS failover (RTO < 60s); region loss → warm standby region (RTO < 30m, RPO < 15m via continuous WAL ship + Kafka mirror). **COST:** see Phase 15.

### 2.2 Container Topology (per service)

Each NestJS service ships as a container with: HTTP server, health endpoints (`/healthz`, `/readyz`), OTel sidecar (or in-process SDK), and (where relevant) a Kafka consumer + BullMQ worker as **separate deployments of the same image** (different entrypoints) so API latency is never coupled to background work.

```
service-X (Deployment, HPA 3→N)        service-X-worker (Deployment, KEDA)
  ├─ api (HTTP/gRPC)                      ├─ kafka consumers
  ├─ /healthz /readyz                     └─ bullmq job processors
  └─ otel
```

### 2.3 Network Topology

- **Public:** only Cloudflare → API Gateway (443).
- **Private VPC:** app tier in private subnets; data tier in isolated subnets (no internet route); NAT for egress to Claude/Stripe/Clerk.
- **Internal traffic:** mTLS via service mesh (Linkerd — lighter than Istio at our scale). East-west authz via SPIFFE identities.
- **Egress allowlist:** `api.anthropic.com`, `api.openai.com`, `api.stripe.com`, `*.clerk.com`, R2.

### 2.4 Service Ownership

| Service | Team (Phase 16) | On-call |
|---|---|---|
| auth, users | Platform | Platform |
| study, tests, mastery | Learning | Learning |
| ai (gateway/RAG) | AI | AI |
| prediction, analytics | Data/ML | Data |
| payments, notifications | Growth | Growth |
| infra/gateway/edge | Platform | Platform |

### 2.5 Request Routing

- REST `/api/v1/*` → Gateway → service (path-based).
- GraphQL `/graphql` → BFF gateway (aggregates for web/mobile dashboards — reduces round trips on mobile).
- WebSocket `/ws` → WS gateway → `ai` (streaming tutor) / `notifications` (live).
- Webhooks `/webhooks/{stripe|clerk}` → dedicated ingress with signature verification, bypasses normal auth.

### 2.6 Environment Separation

| Env | Purpose | Data | Infra |
|---|---|---|---|
| **local** | Dev laptop | Docker Compose (PG/Redis/Kafka/Qdrant/ClickHouse), mocked AI | — |
| **dev** | Integration | seeded synthetic | small EKS namespace |
| **staging** | Pre-prod, load tests, prod-like | anonymized snapshot | mirrors prod sizing (scaled down) |
| **production** | Live | real (encrypted, PII-isolated) | multi-AZ, HPA/KEDA |
| **multi-region** (≥100K) | DR + latency | active-passive → active-active | primary `ap-south-1` (India), standby `ap-southeast-1` |

**WHY `ap-south-1` (Mumbai) primary:** NEET is India-centric — co-locate compute with users for latency and data residency.

### 2.7 Deployment Strategy

GitOps (ArgoCD) + progressive delivery (Argo Rollouts): **canary** (5% → 25% → 100%) for app services with automated rollback on SLO breach; **blue/green** for the API gateway and DB-migration-coupled releases. Details in Phase 13.

---

<a name="phase-3"></a>
## PHASE 3 — REPOSITORY STRUCTURE

Monorepo via **pnpm workspaces + Turborepo** (fast incremental builds, shared TS config, single dependency graph). Already scaffolded on disk.

```
neet-ai/
├─ apps/
│  ├─ web/         # Next.js 14 (App Router) — student web app
│  ├─ mobile/      # Expo / React Native — iOS + Android
│  ├─ admin/       # Next.js — content ops + ops console
│  └─ api/         # NestJS API gateway / BFF composition root
├─ services/
│  ├─ auth/        # Identity, RBAC, Clerk integration, JWT mint/verify
│  ├─ users/       # Profiles, goals, parent links
│  ├─ study/       # Study plans, sessions, AI Planner orchestration
│  ├─ tests/       # Test assembly, attempts, scoring, AI Test Generator
│  ├─ ai/          # AI Gateway: routing, RAG, prompts, memory, cost control
│  ├─ analytics/   # Event ingest → ClickHouse, learning analytics
│  ├─ payments/    # Stripe, subscriptions, entitlements
│  └─ notifications/# Email/push/in-app, digests, nudges
├─ packages/
│  ├─ ui/          # ShadCN + Tailwind shared component library
│  ├─ types/       # Shared TS types, Zod schemas, event contracts (SSOT)
│  ├─ config/      # eslint, tsconfig, tailwind, env schema (zod)
│  ├─ sdk/         # Generated typed client (OpenAPI → TS) for apps
│  └─ shared/      # Domain primitives, logger, errors, tracing, kafka/redis clients
├─ infra/
│  ├─ docker/      # Dockerfiles, docker-compose.yml (local)
│  ├─ k8s/         # Helm charts, base manifests, kustomize overlays
│  └─ terraform/   # AWS (EKS, RDS, MSK, ElastiCache, R2/S3, IAM, VPC)
├─ docs/           # ARCHITECTURE.md (this), ADRs, runbooks
└─ scripts/        # seed, migrate, codegen, load-test, release
```

**Directory rationale:**
- `apps/` = deployable front-ends + API composition root; `services/` = independently deployable backend bounded contexts (Phase 1 map → 1:1).
- `packages/types` is the **single source of truth** for cross-service contracts (Zod schemas → runtime validation + TS types + event contracts). Prevents drift.
- `packages/sdk` generated from OpenAPI so front-ends never hand-write fetch calls.
- `packages/shared` holds cross-cutting infra (logger, OTel, Kafka/Redis/Drizzle clients) so services stay thin.
- `infra/` split by tool; Terraform owns cloud, Helm owns workloads.

**WHY monorepo:** atomic cross-cutting changes (a contract change touches `types` + producer + consumer in one PR), shared CI cache. **SCALING LIMIT:** build times as repo grows. **UPGRADE PATH:** Turborepo remote cache → split into multi-repo only if team > ~40 and ownership conflicts emerge. **FAILURE MODE:** one bad shared package breaks all — mitigated by per-package versioning + CI affected-only builds.

---

<a name="phase-4"></a>
## PHASE 4 — COMPONENT DESIGN

Common contract for **every** service: NestJS modular structure, health/readiness probes, OTel tracing, structured JSON logs (pino), Zod-validated config, graceful shutdown (drain Kafka + in-flight HTTP), and circuit breakers on all outbound deps (`opossum`).

**Standard folder structure per service:**
```
services/<name>/src/
├─ main.ts                 # bootstrap, OTel, graceful shutdown
├─ app.module.ts
├─ config/                 # zod env schema
├─ http/                   # controllers (REST), DTOs (zod)
├─ domain/                 # entities, value objects, domain services (pure)
├─ application/            # use-cases (commands/queries), orchestration
├─ infra/                  # drizzle repos, kafka producers/consumers, clients
├─ events/                 # event handlers (consumers) + contracts
├─ jobs/                   # bullmq processors
└─ health/                 # healthz/readyz
```

**Startup sequence (every service):** load+validate config → init OTel → connect DB (with pool) → connect Redis → connect Kafka (producer + register consumers) → run pending migrations check (fail if behind) → bind HTTP → mark `ready` only after deps healthy.

### Per-service summary

| Service | Scaling model | Key resilience | SLO (P95) | Rate limit | Queues |
|---|---|---|---|---|---|
| **auth** | HPA on CPU/RPS | JWT verify cached; Clerk circuit breaker → cached JWKS | 80 ms | 20 rps/IP login | — |
| **users** | HPA | read-replica for profile reads | 120 ms | 60 rps/user | profile-rebuild |
| **study** | HPA | AI Planner async (job) w/ optimistic UI | 200 ms (sync), planner async | 30 rps/user | plan-generate |
| **tests** | HPA + KEDA (queue) | scoring idempotent; generation via job + cache | 250 ms; gen async | 10 mocks/day Free | test-generate, score |
| **ai** | KEDA on queue depth + HPA | circuit breaker per provider, fallback chain, token budget | 4 s stream-start | per-tier token budget | ai-batch |
| **mastery** | HPA (consumer) | idempotent event apply, DLQ | n/a (async) | — | mastery-recompute |
| **prediction** | HPA + scheduled | model versioned; confidence bands; shadow eval | 1 s (cached) | — | predict-recompute |
| **analytics** | KEDA (consumer) | lossy-tolerant, batched inserts | n/a | — | clickhouse-sink |
| **payments** | HPA | idempotent webhooks, reconciliation cron | 150 ms | — | stripe-sync |
| **notifications** | KEDA (consumer) | provider failover (Resend→SES), dedupe | n/a | per-user cooldown | notify-send, digest |

**Circuit breakers & retries (default policy):** outbound calls use exponential backoff w/ jitter, max 2 retries on idempotent ops only; breaker opens at 50% error over 10s rolling, half-open probe after 30s. AI calls: SDK auto-retries 429/5xx (max_retries=2) + our fallback chain (Phase 10).

**Health checks:** `/healthz` (liveness — process up) vs `/readyz` (deps connected + migrations current + Kafka consumer assigned). K8s uses `/readyz` for traffic gating.

---

<a name="phase-5"></a>
## PHASE 5 — DATA FLOW

Conventions: all flows are **idempotent** (client-supplied `Idempotency-Key` for mutations; event `event_id` for consumers), have explicit **timeouts**, **retries** (idempotent only), and **fallbacks**.

### 5.1 Signup → First Plan
```
Client → Clerk (hosted signup) → Clerk webhook → auth.user.created
auth → publish UserRegistered(Kafka) → users (create profile) , notifications (welcome)
Client → POST /study/diagnostic/start → tests (15-Q diagnostic, cached set)
Client submits → tests.score → publish DiagnosticCompleted
study consumes → job: plan-generate → ai (Planner, Opus 4.8) → study_plans upsert
study → publish StudyPlanCreated → notifications ("Your plan is ready")
```
- **Timeouts:** Clerk webhook 5s; plan-generate job 60s (async, UI shows skeleton).
- **Idempotency:** Clerk event id; plan-generate keyed on `(user_id, diagnostic_id)`.
- **Fallback:** if Planner AI fails, emit a rules-based default plan (syllabus weightage heuristic) flagged `provisional`.

### 5.2 Study Session
```
POST /study/sessions/start {plan_id} → study (create session, idempotency-key)
... study activity ...
POST /study/sessions/{id}/complete → study → publish StudyCompleted
mastery consumes StudyCompleted (+ any QuestionSolved) → recompute mastery (idempotent)
analytics consumes → ClickHouse
```

### 5.3 AI Tutor (streaming)
```
WS connect /ws (JWT) → ai gateway
Client msg → ai: build context (RAG over concept + student memory) →
  Claude Opus 4.8 (stream, adaptive thinking) → tokens streamed to client
On done → persist conversation/messages → publish DoubtAsked (analytics)
```
- **Timeout:** 30s stream idle → close with resumable cursor. **Fallback:** Claude refusal/err → OpenAI; both fail → "service busy" + queue for async answer. **Idempotency:** client message uuid dedupes resends.

### 5.4 Test Generation
```
POST /test/generate {scope, difficulty, count} → tests
  → cache check (Redis: deterministic blueprint hash) → hit? return
  → miss → job test-generate → ai (Sonnet 4.6 for assembly, Batches for bulk)
     → pull from question bank + synthesize gaps → validate (schema + answer key)
     → persist test → cache → publish TestGenerated
```
- **Timeout:** sync wait 3s then 202 + poll/WS. **Fallback:** serve nearest cached blueprint. **Idempotency:** blueprint hash = cache key = job key.

### 5.5 Revision
```
Scheduler (daily) → revision-recompute job → mastery (SM-2/FSRS due calc)
 → build revision_queue → publish RevisionTriggered
notifications → nudge; study surfaces "Due today"
```

### 5.6 Payments
```
Client → POST /payments/checkout → payments → Stripe Checkout Session → redirect
Stripe → webhook /webhooks/stripe (verify sig) → payments (idempotent on event.id)
 → upsert subscription + entitlements → publish PaymentCompleted / SubscriptionUpdated
users/tests read entitlements (cached) → unlock features
Reconciliation cron (hourly): Stripe API ↔ local diff repair
```
- **Recovery:** missed webhook → reconciliation; duplicate → event-id dedupe.

### 5.7 Notifications
```
Any service → publish *Event → notifications consumer → resolve channel (push/email/in-app)
 → dedupe (Redis key user+type+window) → send (Resend → SES fallback) → NotificationSent
```

### 5.8 Analytics & Prediction
```
All services → domain events → Kafka → analytics consumer → ClickHouse (batched)
prediction: on MasteryUpdated (debounced) or daily → predict job →
  feature build (ClickHouse + Postgres) → model (see 10.x) → predictions upsert
  → publish PredictionUpdated → notifications (if meaningful delta)
```

**Sequence (AI Tutor, condensed):**
```
Student   WS-GW      ai           RAG/Qdrant     Claude        DB
  │  msg   │          │               │            │           │
  ├───────►│ ──────► build ctx ─────► retrieve ──► │           │
  │        │          │ ◄──chunks─────┤            │           │
  │        │          │ ── prompt(cached prefix) ─►│           │
  │ ◄──────┼──tokens──┤ ◄──── stream ──────────────┤           │
  │        │          │ ── persist ───────────────────────────►│
```

---

<a name="phase-6"></a>
## PHASE 6 — DATABASE

**Engines:** PostgreSQL 16 (OLTP, Drizzle ORM) · Redis 7 (cache/session/locks) · Qdrant (vectors) · ClickHouse (OLAP/events) · R2 (blobs).

**WHY Postgres primary:** strong consistency for the learning/billing core, rich indexing, JSONB for flexible question payloads, partitioning + logical replication for scale. **WHY ClickHouse separate:** event/analytics volume (billions of rows) would crush OLTP; columnar store gives sub-second aggregations cheaply.

### 6.1 ERD (core)

```
users ──1:1── profiles ──*:1── goals
  │                │
  │ 1:*            │ 1:*
parent_links     study_plans ──1:*── study_sessions
  │                                      │
subscriptions ──1:*── payments           │
  │                                      ▼
entitlements                       (events) mastery ──*:1── concepts
                                      ▲          │            │
tests ──1:*── attempts ──1:*── responses        │       chapters ─ subjects
  │              │                               ▼
questions ───────┘                        mistakes ── revision_queue
concepts ──*:* questions                  predictions
audit_logs   notifications   events(outbox)
```

### 6.2 Schema (representative DDL — Drizzle-aligned)

```sql
-- USERS / IDENTITY
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id      TEXT UNIQUE NOT NULL,
  email         CITEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student',  -- student|parent|admin|support|superadmin
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name     TEXT,
  exam_year     INT,                       -- target NEET year
  target_score  INT,
  language       TEXT DEFAULT 'en',
  prefs         JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE parent_links (
  parent_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  relation      TEXT,
  verified_at   TIMESTAMPTZ,
  PRIMARY KEY (parent_id, student_id)
);

-- BILLING
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  stripe_sub_id TEXT UNIQUE,
  plan          TEXT NOT NULL,             -- free|plus|pro
  status        TEXT NOT NULL,             -- active|past_due|canceled|trialing
  current_period_end TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE entitlements (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  features      JSONB NOT NULL DEFAULT '{}',  -- {mocks_per_week:1, ai_tutor:false,...}
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  stripe_event_id TEXT UNIQUE NOT NULL,    -- idempotency
  amount_cents  INT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'inr',
  status        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CATALOG (syllabus graph)
CREATE TABLE subjects  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, code TEXT UNIQUE); -- Physics/Chem/Bio
CREATE TABLE chapters  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subject_id UUID REFERENCES subjects(id), name TEXT, weight NUMERIC, ncert_ref TEXT);
CREATE TABLE concepts  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), chapter_id UUID REFERENCES chapters(id), name TEXT, difficulty SMALLINT, parent_id UUID REFERENCES concepts(id));
CREATE TABLE questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id    UUID NOT NULL REFERENCES concepts(id),
  type          TEXT NOT NULL,             -- single|multi|assertion-reason|numeric
  stem          TEXT NOT NULL,
  options       JSONB,                     -- [{key,text}]
  answer_key    JSONB NOT NULL,
  solution      TEXT,
  difficulty    SMALLINT NOT NULL,         -- 1..5 (IRT-calibrated)
  irt_a NUMERIC, irt_b NUMERIC,            -- discrimination, difficulty
  source        TEXT NOT NULL DEFAULT 'bank', -- bank|ai|pyq
  status        TEXT NOT NULL DEFAULT 'approved', -- draft|ai_pending|approved
  embedding_id  UUID,                      -- → Qdrant point
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON questions (concept_id, difficulty) WHERE status='approved';

-- STUDY / PLANNING
CREATE TABLE study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  horizon_days INT, blueprint JSONB NOT NULL, status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, plan_id UUID REFERENCES study_plans(id),
  concept_id UUID REFERENCES concepts(id),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, duration_s INT, meta JSONB
);

-- ASSESSMENT
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID, kind TEXT,                -- diagnostic|mock|topic|revision
  blueprint_hash TEXT, question_ids UUID[] NOT NULL,
  meta JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, test_id UUID NOT NULL REFERENCES tests(id),
  started_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ,
  score NUMERIC, max_score NUMERIC, status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
CREATE TABLE responses (
  attempt_id UUID NOT NULL REFERENCES attempts(id),
  question_id UUID NOT NULL,
  selected JSONB, is_correct BOOLEAN, time_ms INT,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)     -- idempotent upsert
);

-- MASTERY / DIAGNOSTICS
CREATE TABLE mastery (
  user_id UUID NOT NULL, concept_id UUID NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,         -- 0..1 (Bayesian/IRT)
  attempts INT DEFAULT 0, last_seen TIMESTAMPTZ,
  PRIMARY KEY (user_id, concept_id)
);
CREATE TABLE mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, question_id UUID NOT NULL, concept_id UUID NOT NULL,
  reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE revision_queue (
  user_id UUID NOT NULL, concept_id UUID NOT NULL,
  due_at TIMESTAMPTZ NOT NULL, interval_d INT, ease NUMERIC,  -- FSRS/SM-2
  reps INT DEFAULT 0,
  PRIMARY KEY (user_id, concept_id)
);
CREATE INDEX ON revision_queue (user_id, due_at);

-- PREDICTION
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, predicted_score INT, rank_band TEXT,
  confidence NUMERIC, model_version TEXT, features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON predictions (user_id, created_at DESC);

-- PLATFORM
CREATE TABLE events (              -- transactional OUTBOX
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate TEXT, type TEXT NOT NULL, payload JSONB NOT NULL,
  published BOOLEAN DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON events (published, created_at) WHERE published = false;
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, type TEXT, channel TEXT, payload JSONB,
  status TEXT DEFAULT 'queued', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_id UUID, action TEXT, target TEXT,
  meta JSONB, ip INET, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
```

### 6.3 Indexing, Partitioning, Replication, Sharding

- **Indexes:** covering indexes on hot reads (`mastery PK`, `revision_queue(user_id,due_at)`, `questions(concept_id,difficulty)`, `predictions(user_id,created_at DESC)`). Partial indexes to keep them small (`WHERE status='approved'`, `WHERE published=false`).
- **Partitioning:** `attempts`, `responses`, `audit_logs`, and the analytics-bound tables partitioned **by month (RANGE on created_at)**. Old partitions detached → cold storage. WHY: time-series growth, cheap pruning, fast vacuum.
- **Read replicas:** 2 replicas from launch for dashboard/analytics reads; route via Drizzle read/write split. Predictions & analytics read from replicas only.
- **Sharding plan (≥1M MAU):** shard OLTP by `user_id` (hash) using Citus or app-level routing. The schema is already `user_id`-leading on hot tables to make this clean. **UPGRADE PATH:** vertical scale RDS → read replicas → partitioning → Citus distribution → multi-region.

### 6.4 Migration Strategy

Drizzle migrations, **expand–contract** pattern (add column/table → backfill → switch reads → drop) so deploys never require downtime. Migrations gated in CI; `study`/`tests` run migration-check at boot (refuse to start if behind). Destructive changes require a second approval + backup snapshot.

**FAILURE MODE / RPO/RTO:** RDS Multi-AZ (sync standby, failover < 60s), automated snapshots + PITR (RPO 5 min), WAL archived to S3, cross-region replica for DR (RPO < 15m, RTO < 30m). ClickHouse replicated (ReplicatedMergeTree). Qdrant snapshots to R2.

---

<a name="phase-7"></a>
## PHASE 7 — API DESIGN

**Style:** REST (`/api/v1`) for resources + commands; **GraphQL BFF** for read-heavy dashboard aggregation; **WebSocket** for AI streaming + live notifications; **Webhooks** inbound (Stripe/Clerk) and outbound (institute tier later).

**Cross-cutting:** Zod-validated DTOs; auth via Clerk JWT (Bearer) → gateway verifies → injects `x-user-id`/`x-roles`; cursor pagination (`?cursor=&limit=`); RFC-7807 problem+json errors; `/api/v1` version prefix (additive changes only; breaking → `/v2`); `Idempotency-Key` header on POST.

**Error envelope:**
```json
{ "type":"https://errors.neet.ai/quota_exceeded", "title":"Mock limit reached",
  "status":429, "detail":"Free plan allows 1 mock/week", "instance":"req_abc",
  "code":"QUOTA_EXCEEDED" }
```

### Representative endpoints (OpenAPI excerpt)

```yaml
openapi: 3.1.0
info: { title: NEET AI API, version: 1.0.0 }
paths:
  /api/v1/auth/login:
    post:
      summary: Exchange Clerk session for app JWT
      responses: { '200': { description: token + user }, '401': {...} }
  /api/v1/dashboard:
    get:
      summary: Aggregated home (plan, due revisions, last prediction, streak)
      security: [{ bearerAuth: [] }]
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Dashboard' }}}}}
  /api/v1/study/start:
    post:
      parameters: [{ in: header, name: Idempotency-Key, required: true }]
      requestBody: { content: { application/json: { schema: { $ref: '#/components/schemas/StartStudy' }}}}
      responses: { '201': { description: session }, '402': { description: upgrade required }}
  /api/v1/ai/chat:
    post:
      summary: AI tutor (SSE/WS streaming)
      responses: { '200': { description: 'text/event-stream of tokens' }}
  /api/v1/test/generate:
    post:
      responses: { '200': { description: cached test }, '202': { description: generating (poll/ws) }}
  /api/v1/prediction:
    get:
      responses: { '200': { content: { application/json: { schema: { $ref: '#/components/schemas/Prediction' }}}}}
components:
  securitySchemes: { bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT } }
  schemas:
    Prediction:
      type: object
      properties:
        predicted_score: { type: integer, example: 612 }
        rank_band: { type: string, example: "1500-3000" }
        confidence: { type: number, example: 0.82 }
        levers: { type: array, items: { type: string } }
```

**Examples (request/response):**
```
POST /api/v1/ai/chat        → SSE: data: {"delta":"To solve..."} ... data: [DONE]
POST /api/v1/test/generate  {scope:{chapter_id},count:30,difficulty:"adaptive"} → 202 {job_id}
GET  /api/v1/prediction     → 200 {predicted_score:612, rank_band:"1500-3000", confidence:0.82, levers:[...]}
```

**GraphQL gateway:** single `dashboard` query stitches study + mastery + prediction + entitlements to cut mobile round-trips. Reads only; mutations go to REST for clear command semantics + idempotency.

**Webhooks:** `/webhooks/stripe` & `/webhooks/clerk` verify HMAC signature, return 2xx fast, process async (enqueue), dedupe on event id.

---

<a name="phase-8"></a>
## PHASE 8 — CACHING

Layered, with explicit keys/TTL/invalidation and stampede protection.

| Layer | What | Key | TTL | Invalidation |
|---|---|---|---|---|
| **Edge (CDN)** | static assets, public mocks, marketing | URL + version hash | immutable assets ∞; pages 60s | deploy purge / cache-tag |
| **App (Redis)** | dashboard agg, entitlements, syllabus graph, session | `dash:{uid}`, `ent:{uid}`, `syllabus:v{n}` | dash 30s, ent 300s, syllabus 1d | event-driven (`SubscriptionUpdated`→del ent) |
| **AI prompt cache** | Claude prompt-prefix cache (syllabus/system) | provider-managed (prefix) | 5 min / 1h | stable prefix (frozen system) |
| **DB cache** | read-through for hot queries | `q:{hash}` | 60s | write-through on mutation |
| **Generated content** | test blueprints, AI solutions | `test:{blueprint_hash}`, `sol:{qid}` | tests 1d, solutions ∞ | content version bump |

**Read/write strategy:** cache-aside (read-through) for dashboards; write-through for entitlements (correctness-critical). **Stampede prevention:** single-flight lock (`SET key lock NX PX 5000`) — first request computes, others wait/serve-stale; jittered TTLs; background refresh for the dashboard.

**AI prompt caching (critical for cost):** the NEET syllabus + grading rubric + system prompt are placed as the **stable cached prefix** (1h TTL) in every AI call; only the per-student/question suffix varies. This yields ~90% input-token savings on the repeated context (see Phase 15). Verified via `usage.cache_read_input_tokens`. Frozen system prompt — **no timestamps/UUIDs in the prefix** or the cache silently misses.

**WHY:** read:write ratio is ~20:1 (everyone reads dashboards; fewer write). **FAILURE MODE:** Redis down → degrade to DB (replicas) with tighter rate limits; AI cache miss → higher cost, not an outage.

---

<a name="phase-9"></a>
## PHASE 9 — EVENT ARCHITECTURE

**Backbone:** Kafka (AWS MSK) for domain events; **BullMQ (Redis)** for in-service jobs/retries. **Transactional Outbox** (the `events` table) → CDC/poller → Kafka guarantees at-least-once publish atomic with DB writes.

**WHY Kafka over Redis Streams at this scale:** durable replay, partitioning by `user_id` for ordered per-user processing, multiple independent consumer groups (mastery, analytics, notifications, prediction all read the same stream). *Launch-cost note:* if budget is tight at 10K MAU, Redis Streams is a valid temporary substitute — upgrade trigger is >5 consumer groups or >50M events/day.

### Topics

| Topic | Key | Partitions | Consumers | Retention |
|---|---|---|---|---|
| `study.events` | user_id | 24 | mastery, analytics | 7d |
| `assessment.events` | user_id | 24 | mastery, prediction, analytics | 7d |
| `mastery.events` | user_id | 24 | prediction, study, analytics | 7d |
| `billing.events` | user_id | 12 | users, notifications, analytics | 30d |
| `notification.events` | user_id | 12 | notifications | 3d |
| `*.DLQ` | — | 6 | ops/manual | 14d |

### Event contracts (versioned, in `packages/types`)
```ts
// envelope
{ event_id: uuid, type: "QuestionSolved", version: 1, occurred_at: iso,
  actor: uuid, payload: {...}, trace_id: string }
```
Events: `StudyStarted`, `StudyCompleted`, `QuestionSolved`, `RevisionTriggered`, `PredictionUpdated`, `PaymentCompleted`, `NotificationSent` (+ `UserRegistered`, `SubscriptionUpdated`, `MasteryUpdated`, `DiagnosticCompleted`, `TestGenerated`).

**Idempotency:** consumers store processed `event_id` (Redis set w/ TTL or `processed_events` table) → skip duplicates. **DLQ:** after N retries (exponential), route to `<topic>.DLQ` with error context; alert + replay tooling. **Replay:** consumers can reset offset / re-consume DLQ after fix. **Ordering:** per-`user_id` partition guarantees a single user's events are processed in order (critical for mastery math).

**Schema evolution:** additive-only within a version; breaking → new `version` + dual-read window.

---

<a name="phase-10"></a>
## PHASE 10 — AI PLATFORM

The differentiator. All AI flows through the **`ai` service (AI Gateway)** — one place for routing, cost control, caching, safety, and failover. **Claude is primary; OpenAI is fallback.**

### 10.1 Model Routing (cost/quality matched to task)

| Use case | Primary model | Why | Fallback |
|---|---|---|---|
| AI Planner (multi-constraint plan) | **Claude Opus 4.8** (`claude-opus-4-8`), `effort:"high"`, adaptive thinking | hardest reasoning; long-horizon planning over 1M-token syllabus context | OpenAI GPT-tier |
| Score Predictor (reasoning blend) | **Opus 4.8** for explanation; numeric model for the score | quality of "why" + levers | rules + regression |
| AI Tutor (chat, streaming) | **Sonnet 4.6** (`claude-sonnet-4-6`) default; Opus 4.8 for hard doubts | best speed/intelligence balance, 1M context | Haiku 4.5 / OpenAI |
| AI Doubt Solver (OCR+solve) | **Sonnet 4.6** (vision) | image understanding + stepwise solve | Opus 4.8 on low confidence |
| AI Test Generator (bulk assembly) | **Haiku 4.5** (`claude-haiku-4-5`) + **Batches API** (50% off) overnight | high volume, cost-sensitive, schema-constrained | Sonnet 4.6 |
| Classification (mistake reason, intent) | **Haiku 4.5** | cheap, fast, structured output | — |

**Routing logic:** `(task_type, difficulty, user_tier, budget_remaining)` → model. Free tier capped to Haiku/Sonnet; Pro unlocks Opus. Difficulty escalation: start cheap, escalate on low self-reported confidence.

### 10.2 AI Gateway responsibilities
Prompt Router · Context Engine (RAG) · Memory · Streaming · Token budgets · Caching · Observability · Safety. Single SDK integration (Anthropic SDK, `claude-opus-4-8` etc.), with adaptive thinking (`thinking:{type:"adaptive"}`) and `output_config:{effort}` per task.

### 10.3 RAG & Embeddings
- **Store:** Qdrant. Collections: `concepts`, `questions`, `solutions`, `student_memory`.
- **Embeddings:** batch-embed syllabus + question bank; store `embedding_id` ↔ Qdrant point. Retrieval: top-k by concept + difficulty filter, re-rank, inject as cached-prefix context.
- **Context Engine:** assembles `[stable: system+syllabus rubric (cached)] + [retrieved concept chunks] + [student memory] + [query]`. Stable parts first → maximize prompt-cache hits.

### 10.4 Memory
Per-student durable memory (weak/strong concepts, learning style, prior doubts) stored in Postgres + summarized into a compact "memory card" embedded in Qdrant; injected into tutor/planner context. Survives sessions.

### 10.5 Token budgets & cost control
- Per-tier daily token budget (Redis counter); on exhaustion → downgrade model or queue.
- Task-level `max_tokens` ceilings; streaming for long outputs (avoid timeouts).
- **Prompt caching** of the syllabus/system prefix (1h TTL) — the single biggest lever (Phase 15 shows ~90% savings on repeated context).
- **Batches API** for non-interactive generation (overnight test/revision content) at 50%.

### 10.6 Streaming
Tutor/doubt responses stream via SSE/WS using the SDK stream helper (`get_final_message()`/`finalMessage()` for persistence). Adaptive thinking with `display:"summarized"` only where we surface reasoning.

### 10.7 Safety & fallback
- **Refusal handling:** check `stop_reason` before reading content; on refusal/error → fallback chain (Claude→OpenAI→cached/queued).
- **Output validation:** all generated questions validated against a Zod schema + answer-key sanity check before persistence; AI content flagged `ai_pending` for human approval (admin).
- **Guardrails:** input moderation (block off-syllabus/abuse), PII scrubbing before sending to providers, no secrets in prompts.
- **Cost circuit breaker:** global daily spend cap → auto-throttle to cheapest models + alert.

### 10.8 AI observability
Per-call logging: model, tokens (in/out/cache_read), latency, cost, task_type, cache hit %, fallback used, refusal. Dashboards on cost/req, P95 latency, fallback rate. `request_id` captured for provider support.

---

<a name="phase-11"></a>
## PHASE 11 — SECURITY

- **AuthN:** Clerk (hosted, MFA, social) → short-lived app JWT (15 min) + refresh; JWKS verified at gateway.
- **AuthZ (RBAC):** roles (student/parent/admin/support/superadmin) + attribute checks (parent can read only linked child; **never** chat content). Enforced in gateway + per-service guards. Policy-as-code (CASL).
- **WAF / edge:** Cloudflare WAF, OWASP ruleset, bot management, rate limiting, DDoS L3/7.
- **Encryption:** TLS 1.3 everywhere; at-rest AES-256 (RDS/ClickHouse/R2 via KMS); field-level encryption for sensitive PII (DOB, phone) with envelope keys.
- **PII isolation:** PII columns segregated + encrypted; analytics/ClickHouse store pseudonymized `user_id` only; AI prompts scrub PII. Data residency in `ap-south-1`.
- **Secrets:** Doppler/Vault; never in env files committed; rotated; per-env scoping; least-privilege IAM.
- **OWASP Top-10:** input validation (Zod), parameterized queries (Drizzle), output encoding, CSRF tokens (web), security headers (CSP, HSTS), SSRF egress allowlist, dependency scanning.
- **Threat model (STRIDE highlights):** spoofing→Clerk+JWT; tampering→signed webhooks+mTLS; repudiation→audit_logs; info disclosure→PII isolation+RBAC; DoS→WAF+rate limits+autoscale; elevation→least-priv RBAC + service identities.
- **Abuse detection:** anomaly on AI usage (token spikes), credential stuffing detection, device fingerprint, mock-answer-scraping detection.
- **Audit logging:** immutable `audit_logs` (append-only, partitioned) for all privileged/admin/impersonation actions; shipped to SIEM.
- **SOC2 readiness:** access reviews, change management (PR + approvals), encryption, logging/monitoring, incident response, vendor management — controls mapped from day one; evidence auto-collected.

---

<a name="phase-12"></a>
## PHASE 12 — OBSERVABILITY

**Stack:** OpenTelemetry (traces/metrics/logs) → Prometheus + Grafana (metrics/dashboards), Loki (logs), Tempo (traces), Sentry (errors), Alertmanager + PagerDuty.

- **Metrics (RED + USE):** per-service request rate/errors/duration; AI cost/latency/fallback; queue depth/lag; DB pool/replication lag; cache hit ratio; business KPIs (DAU, mocks/day, conversions).
- **Logs:** structured JSON (pino), `trace_id` correlated, PII-redacted, centralized in Loki, 30-day hot / archive cold.
- **Tracing:** distributed via OTel context propagation across gateway→service→AI→DB; sample 100% errors, 10% success.
- **Dashboards:** Golden Signals per service; AI cost dashboard; learning-loop funnel; result-day war-room board.
- **Alerts (SLO-based):** error-budget burn alerts (multi-window), API P95 > 250ms, AI P95 > 4s, Kafka lag > threshold, replication lag > 30s, cost/day > cap, payment webhook failure.
- **Error budgets:** 99.95% → ~21 min/month; burn-rate policy gates risky deploys; budget exhaustion → freeze features, focus reliability.
- **Incident playbooks (runbooks in `docs/`):** AI provider outage, DB failover, Kafka lag, payment reconciliation, result-day surge — each with detection, mitigation, comms, rollback.

---

<a name="phase-13"></a>
## PHASE 13 — DEVOPS

- **Containers:** multi-stage Dockerfiles (distroless runtime, non-root, pinned digests). One image per service, dual entrypoints (api/worker).
- **Local:** `docker-compose` (PG, Redis, Kafka, Qdrant, ClickHouse, mock-AI) for laptop parity.
- **Kubernetes:** EKS; Helm charts per service + kustomize env overlays; HPA (CPU/RPS), KEDA (queue depth) for workers; PodDisruptionBudgets; resource requests/limits; topology spread across AZs.
- **Terraform:** all cloud infra (VPC, EKS, RDS Multi-AZ + replicas, MSK, ElastiCache, R2/S3, KMS, IAM, Cloudflare). State in S3 + lock in DynamoDB; per-env workspaces.
- **CI (GitHub Actions):** lint → typecheck → unit → build (Turbo affected-only) → integration (testcontainers) → SAST/dep-scan → image build+sign (cosign) → push.
- **CD (ArgoCD GitOps + Argo Rollouts):** **canary** for app services (5→25→100% with automated SLO-gated promotion/rollback); **blue/green** for gateway + migration-coupled releases.
- **DB migrations:** expand–contract, run as pre-deploy K8s Job; auto-rollback on failure.
- **Autoscaling:** HPA app tier (3→N), KEDA workers (scale-to-near-zero off-peak; surge for result-day), Cluster Autoscaler/Karpenter nodes.
- **Rollback:** Argo one-click + DB-safe (expand–contract means old code works against new schema).
- **DR:** cross-region warm standby, Terraform-reproducible, game-day tested quarterly.

---

<a name="phase-14"></a>
## PHASE 14 — IMPLEMENTATION

Concrete stack & bootstrap. (Code scaffolding is the next deliverable — this section is the executable plan.)

**Stack:** Next.js 14 + Tailwind + ShadCN (web/admin) · Expo (mobile) · NestJS (services) · Drizzle + PostgreSQL · Redis · Kafka · **Anthropic SDK (Claude primary)** + OpenAI SDK (fallback) · Cloudflare R2 · Clerk.

**Bootstrap commands:**
```bash
pnpm init && pnpm dlx turbo gen workspace
# services (Nest)
pnpm dlx @nestjs/cli new services/ai --package-manager pnpm
# web
pnpm create next-app apps/web --ts --tailwind --app
pnpm dlx shadcn@latest init
# db
pnpm add drizzle-orm pg && pnpm add -D drizzle-kit
# ai
pnpm add @anthropic-ai/sdk openai
# infra
docker compose -f infra/docker/docker-compose.yml up -d
```

**AI Gateway core (illustrative — Claude primary, adaptive thinking, prompt caching):**
```ts
// services/ai/src/infra/claude.client.ts
import Anthropic from "@anthropic-ai/sdk";
const claude = new Anthropic();

export async function tutorStream(opts: {
  syllabusPrefix: string;   // STABLE → cached prefix
  context: string;          // RAG chunks + student memory
  question: string;
  hard?: boolean;
}) {
  return claude.messages.stream({
    model: opts.hard ? "claude-opus-4-8" : "claude-sonnet-4-6",
    max_tokens: 64000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: opts.hard ? "high" : "medium" },
    system: [
      { type: "text", text: opts.syllabusPrefix,
        cache_control: { type: "ephemeral", ttl: "1h" } },   // 90% input savings
    ],
    messages: [
      { role: "user", content: `${opts.context}\n\nStudent question: ${opts.question}` },
    ],
  });
}
```

**Fallback wrapper:** try Claude → on `stop_reason==="refusal"` or error, retry on alternate Claude model, then OpenAI; surface `request_id` for support. Bulk generation uses `claude.messages.batches.create` (50% off).

**Config/env:** Zod-validated `packages/config`; secrets from Doppler. **Tests:** unit (Vitest) per domain; integration (testcontainers: PG/Redis/Kafka); contract tests on event schemas; e2e (Playwright) for top journeys; AI eval harness (rubric-graded golden prompts) in CI. **CI/CD & deploy:** Phase 13.

---

<a name="phase-15"></a>
## PHASE 15 — SCALE & COST

Order-of-magnitude monthly estimates (INR-market, AWS `ap-south-1`, USD). Figures are planning ranges, not quotes.

| Dimension | 10K MAU | 100K MAU | 1M MAU |
|---|---|---|---|
| **Compute (EKS)** | $0.8–1.2K | $6–9K | $45–70K |
| **PostgreSQL (RDS + replicas)** | $0.4K | $3–4K | $25–35K (sharded) |
| **Redis / ElastiCache** | $0.2K | $1.5K | $10K |
| **Kafka (MSK)** | $0.3K | $2K | $12K |
| **ClickHouse** | $0.2K | $1.5K | $9K |
| **Qdrant** | $0.15K | $1K | $6K |
| **Storage/Bandwidth (R2/CDN)** | $0.1K | $0.8K | $6K |
| **Monitoring** | $0.2K | $1.2K | $7K |
| **AI (Claude, post-optimization)** | $1.5–3K | $12–25K | $90–180K |
| **Total (≈)** | **$4–6K** | **$30–48K** | **$210–340K** |

**AI cost model & optimization path (the dominant lever):**
- Token math (Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 per MTok).
- **Optimizations, in order:** (1) **prompt caching** of syllabus prefix → ~90% off repeated input; (2) **model tiering** — Haiku for bulk gen/classification, Sonnet for tutor, Opus only for hard reasoning; (3) **Batches API** (50% off) for overnight content; (4) per-tier token budgets; (5) RAG to keep context tight; (6) cache generated solutions/tests (compute once, serve many). Combined, these cut naive AI spend ~70–85%.
- **Free-tier guardrail:** Free users restricted to cheap models + low quotas so unit economics stay positive; Pro subsidizes Opus.

**Optimization path by stage:** 10K → managed everything, single region. 100K → read replicas, KEDA workers, Batches, reserved instances/Savings Plans (~30% compute off). 1M → Citus sharding, multi-region active-active, dedicated AI cost engineering, spot for batch workers.

---

<a name="phase-16"></a>
## PHASE 16 — EXECUTION

### 90-Day Build Plan
- **Days 1–30 (Foundation):** monorepo + infra (Terraform/EKS/RDS/Kafka), auth (Clerk), users, catalog seed (NEET syllabus + initial question bank), CI/CD, observability baseline. Ship: signup + diagnostic + dashboard skeleton.
- **Days 31–60 (Core loop):** study + planning, tests + attempts + scoring, mastery, AI Gateway + Tutor + Doubt Solver (Claude), prompt caching, payments (Stripe) + entitlements. Ship: full study + mock + tutor + paywall.
- **Days 61–90 (Intelligence + hardening):** AI Test Generator (Batches), revision engine (FSRS), score predictor, analytics (ClickHouse), parent dashboard, admin console, security review, load test to 200K concurrent, canary rollout. Ship: GA.

### Hiring Plan (lean → scale)
Founding: 1 Platform, 2 Backend, 1 Frontend, 1 AI/ML, 1 Product, (CTO). At 100K: +DevOps/SRE, +Data/ML, +QA, +Mobile, +Content lead. Ownership map = Phase 2.4.

### Risk Register (top)
| Risk | Mitigation |
|---|---|
| AI cost runaway | caching + tiering + budgets + spend circuit breaker |
| Provider outage | Claude→OpenAI fallback + cached content |
| Content accuracy (AI questions) | human approval gate, IRT calibration, PYQ anchoring |
| Prediction credibility | confidence bands, post-NEET back-testing, transparency |
| Result-day surge | autoscale + queue + pre-generation + war-room runbook |
| Data privacy/minor data | PII isolation, parental consent, residency, SOC2 path |

### Launch Checklist
Load-tested to peak · DR game-day passed · SLO dashboards + alerts live · runbooks written · security review + pen-test done · Stripe live mode + reconciliation · backups/PITR verified · feature flags + kill switches · rollback rehearsed · cost caps armed.

### Technical Debt Policy
20% of each sprint to debt/reliability; every shortcut logged as an ADR with payoff trigger; no `TODO` in prod code — tracked issues only; error-budget exhaustion auto-prioritizes reliability over features.

---

## Deliverables status
1. **Architecture document** — ✅ this file (Phases 1–16).
2. **Production codebase** — scaffold created (`apps/ services/ packages/ infra/`); implementation per Phase 14 (next).
3. **Deployment setup** — designed (Phase 13); Terraform/Helm to be authored.
4. **Infrastructure plan** — ✅ Phases 2, 13, 15.
5. **Cost model** — ✅ Phase 15.

**Next recommended step:** scaffold the runnable vertical slice — `ai` gateway (Claude tutor stream + fallback + prompt cache) + `auth` + `web` dashboard — booting via `docker-compose`, proving the core loop end-to-end.
