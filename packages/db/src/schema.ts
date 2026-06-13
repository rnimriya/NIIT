import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema — the slice subset of the Phase 6 model (see docs/ARCHITECTURE.md).
 * Active: users, profiles, conversations, messages, catalog (subjects/chapters/
 * concepts/questions), assessment (tests/attempts/responses), mastery.
 */

// ---- Identity ----
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name"),
  examYear: integer("exam_year"),
  targetScore: integer("target_score"),
  language: text("language").default("en"),
  prefs: jsonb("prefs").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Tutoring ----
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Billing ----
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeSubId: text("stripe_sub_id").unique(),
  plan: text("plan").notNull().default("free"), // free | plus | pro
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlements = pgTable("entitlements", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  features: jsonb("features").notNull(), // Entitlements shape from @neet/types
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeEventId: text("stripe_event_id").unique(), // idempotency key for webhooks
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("inr"),
  status: text("status").notNull().default("succeeded"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Catalog (NEET syllabus graph) ----
export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // physics | chemistry | biology
  name: text("name").notNull(),
});

export const chapters = pgTable("chapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id").notNull().references(() => subjects.id),
  name: text("name").notNull(),
  weight: real("weight").default(1),
});

export const concepts = pgTable("concepts", {
  id: uuid("id").primaryKey().defaultRandom(),
  chapterId: uuid("chapter_id").notNull().references(() => chapters.id),
  name: text("name").notNull(),
  difficulty: integer("difficulty").notNull().default(2),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  conceptId: uuid("concept_id").notNull().references(() => concepts.id),
  subject: text("subject").notNull(), // denormalized code for fast breakdown
  type: text("type").notNull().default("single"),
  stem: text("stem").notNull(),
  options: jsonb("options").notNull(), // [{key,text}]
  answerKey: jsonb("answer_key").notNull(), // {correct:"a"}
  difficulty: integer("difficulty").notNull().default(2),
  source: text("source").notNull().default("bank"),
  status: text("status").notNull().default("approved"),
});

// ---- Assessment ----
export const tests = pgTable("tests", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("diagnostic"),
  questionIds: uuid("question_ids").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attempts = pgTable("attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  testId: uuid("test_id").notNull().references(() => tests.id),
  score: integer("score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(0),
  status: text("status").notNull().default("submitted"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow(),
});

export const responses = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => questions.id),
  selected: text("selected"), // chosen option key, null = unattempted
  isCorrect: integer("is_correct").notNull().default(0), // 1 correct, 0 wrong/none
});

// ---- Mastery ----
export const mastery = pgTable(
  "mastery",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull().references(() => concepts.id),
    score: real("score").notNull().default(0), // 0..1
    attempts: integer("attempts").notNull().default(0),
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.conceptId] }) }),
);

// ---- Study & Planning ----
export const studyPlans = pgTable("study_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  horizonDays: integer("horizon_days").notNull().default(7),
  plan: jsonb("plan").notNull(), // { summary, days:[...] }
  source: text("source").notNull().default("deterministic"), // anthropic|openai|deterministic
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---- Prediction ----
export const predictions = pgTable("predictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  predictedScore: integer("predicted_score").notNull(),
  rankBand: text("rank_band").notNull(),
  confidence: real("confidence").notNull(),
  weightedMastery: real("weighted_mastery").notNull(),
  coverage: real("coverage").notNull(),
  levers: jsonb("levers").notNull(), // [{conceptId,name,currentMastery,potentialGain}]
  modelVersion: text("model_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Concept = typeof concepts.$inferSelect;
export type Prediction = typeof predictions.$inferSelect;
export type StudyPlanRow = typeof studyPlans.$inferSelect;
