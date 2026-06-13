import { z } from "zod";

/**
 * Cross-service contracts — single source of truth.
 * Zod gives us runtime validation + inferred TS types in one place.
 */

// ---- NEET domain primitives ----
export const Subject = z.enum(["physics", "chemistry", "biology"]);
export type Subject = z.infer<typeof Subject>;

// ---- AI Tutor ----
export const ChatRequest = z.object({
  /** Free-text student question. */
  question: z.string().min(1).max(4000),
  /** Optional concept/chapter for RAG scoping. */
  conceptId: z.string().uuid().optional(),
  subject: Subject.optional(),
  /** Force the high-reasoning model (Opus) for a hard doubt. */
  hard: z.boolean().optional().default(false),
  /** Client-side message id for idempotent resends. */
  clientMessageId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatMeta = z.object({
  model: z.string(),
  provider: z.enum(["anthropic", "openai", "mock"]),
  fallbackUsed: z.boolean(),
  cacheRead: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});
export type ChatMeta = z.infer<typeof ChatMeta>;

/** SSE event shapes streamed from POST /api/v1/ai/chat */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; meta: ChatMeta }
  | { type: "error"; message: string };

// ---- AI Planner ----
export const Lever = z.object({
  conceptId: z.string(),
  name: z.string(),
  currentMastery: z.number(),
  potentialGain: z.number(),
});
export type Lever = z.infer<typeof Lever>;

export const PlanInput = z.object({
  horizonDays: z.number().int().min(1).max(90).default(7),
  predictedScore: z.number().int(),
  rankBand: z.string(),
  levers: z.array(Lever),
});
export type PlanInput = z.infer<typeof PlanInput>;

export const PlanTask = z.object({
  type: z.enum(["study", "practice", "revise"]),
  concept: z.string(),
  minutes: z.number().int(),
});
export const PlanDay = z.object({
  day: z.number().int(),
  focus: z.string(),
  tasks: z.array(PlanTask),
});
export const StudyPlan = z.object({
  summary: z.string(),
  days: z.array(PlanDay),
});
export type StudyPlan = z.infer<typeof StudyPlan>;

export interface PlanResult {
  plan: StudyPlan;
  model: string;
  provider: "anthropic" | "openai" | "deterministic";
}

// ---- Domain events (Kafka envelope) ----
export const EventEnvelope = z.object({
  eventId: z.string().uuid(),
  type: z.string(),
  version: z.number().int().positive(),
  occurredAt: z.string().datetime(),
  actor: z.string().uuid().optional(),
  traceId: z.string().optional(),
  payload: z.record(z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelope>;
