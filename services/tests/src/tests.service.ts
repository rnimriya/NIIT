import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  tests,
  attempts,
  responses,
  questions,
  concepts,
  mastery,
  type Database,
} from "@neet/db";
import { emitNotification } from "@neet/shared";
import { kafkaBrokers, ASSESSMENT_TOPIC, type DomainEvent } from "@neet/events";
import { outbox } from "@neet/db";
import { randomUUID } from "node:crypto";
import { DB } from "./db.module";
import { config } from "./config";

const SUBJECTS = ["physics", "chemistry", "biology"] as const;
const PER_SUBJECT = 2;
const CORRECT = 4;
const WRONG = -1;
const EWMA_ALPHA = 0.5;
const WEAK_THRESHOLD = 0.6;

export interface DiagnosticQuestion {
  id: string;
  subject: string;
  stem: string;
  options: { key: string; text: string }[];
}

export interface ScoreResult {
  testId: string;
  attemptId: string | null;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  perSubject: Record<string, { correct: number; total: number }>;
  weakConcepts: { conceptId: string; name: string; accuracy: number }[];
  persisted: boolean;
}

@Injectable()
export class TestsService {
  // When Kafka is enabled, scoring writes a TestScored event to the outbox in
  // the same transaction (a relay publishes it; prediction + notifications
  // consume). Otherwise we fall back to a direct HTTP notify.
  private readonly kafkaEnabled = !!kafkaBrokers();

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Builds a balanced diagnostic (PER_SUBJECT questions per subject). */
  async buildDiagnostic(ownerId?: string): Promise<{
    testId: string;
    questions: DiagnosticQuestion[];
  }> {
    const picked: (typeof questions.$inferSelect)[] = [];
    for (const code of SUBJECTS) {
      const rows = await this.db
        .select()
        .from(questions)
        .where(eq(questions.subject, code))
        .limit(PER_SUBJECT);
      picked.push(...rows);
    }
    if (picked.length === 0) throw new NotFoundException("Question bank empty");

    const [test] = await this.db
      .insert(tests)
      .values({
        ownerId: ownerId ?? null,
        kind: "diagnostic",
        questionIds: picked.map((q) => q.id),
      })
      .returning();

    return {
      testId: test.id,
      // never leak answer keys to the client
      questions: picked.map((q) => ({
        id: q.id,
        subject: q.subject,
        stem: q.stem,
        options: q.options as DiagnosticQuestion["options"],
      })),
    };
  }

  /** Scores a submission, persists the attempt, and recomputes mastery. */
  async score(
    testId: string,
    submitted: { questionId: string; selected?: string | null }[],
    userId?: string,
  ): Promise<ScoreResult> {
    const [test] = await this.db.select().from(tests).where(eq(tests.id, testId)).limit(1);
    if (!test) throw new NotFoundException("Test not found");

    const qs = await this.db
      .select()
      .from(questions)
      .where(inArray(questions.id, test.questionIds));
    const byId = new Map(qs.map((q) => [q.id, q]));
    const answerOf = (s?: string | null) => s ?? null;

    let score = 0;
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const perSubject: Record<string, { correct: number; total: number }> = {};
    const perConcept = new Map<string, { correct: number; total: number }>();
    const graded: { questionId: string; selected: string | null; isCorrect: number }[] = [];

    for (const qid of test.questionIds) {
      const q = byId.get(qid);
      if (!q) continue;
      const sel = answerOf(submitted.find((s) => s.questionId === qid)?.selected);
      const key = (q.answerKey as { correct: string }).correct;
      const isCorrect = sel !== null && sel === key;

      perSubject[q.subject] ??= { correct: 0, total: 0 };
      perSubject[q.subject].total++;
      const pc = perConcept.get(q.conceptId) ?? { correct: 0, total: 0 };
      pc.total++;

      if (isCorrect) {
        score += CORRECT;
        correct++;
        perSubject[q.subject].correct++;
        pc.correct++;
      } else if (sel !== null) {
        score += WRONG;
        wrong++;
      } else {
        unattempted++;
      }
      perConcept.set(q.conceptId, pc);
      graded.push({ questionId: qid, selected: sel, isCorrect: isCorrect ? 1 : 0 });
    }

    const maxScore = test.questionIds.length * CORRECT;

    // Persist the attempt (+ responses, + mastery) only for signed-in users.
    let attemptId: string | null = null;
    let persisted = false;
    if (userId) {
      await this.db.transaction(async (tx) => {
        const [att] = await tx
          .insert(attempts)
          .values({ userId, testId, score, maxScore })
          .returning();
        attemptId = att.id;
        await tx.insert(responses).values(
          graded.map((g) => ({
            attemptId: att.id,
            questionId: g.questionId,
            selected: g.selected,
            isCorrect: g.isCorrect,
          })),
        );
        await this.recomputeMastery(tx, userId, perConcept);

        if (this.kafkaEnabled) {
          // Transactional outbox: the event commits atomically with the
          // attempt + mastery. The relay publishes it; consumers react.
          const event: DomainEvent = {
            eventId: randomUUID(),
            type: "TestScored",
            version: 1,
            occurredAt: new Date().toISOString(),
            actor: userId,
            payload: { testId, score, maxScore, correct, wrong },
          };
          await tx.insert(outbox).values({
            topic: ASSESSMENT_TOPIC,
            key: userId,
            type: "TestScored",
            payload: event,
          });
        }
      });
      persisted = true;

      if (!this.kafkaEnabled) {
        // HTTP fallback (no event bus): notify directly.
        void emitNotification(config.NOTIFICATIONS_URL, {
          userId,
          type: "test_scored",
          title: `Diagnostic scored: ${score}/${maxScore}`,
          body: `You got ${correct} right, ${wrong} wrong. Generate a study plan to target your weak areas.`,
          dedupeWindowSec: 5,
        });
      }
    }

    const weakConcepts = await this.weakFrom(perConcept);

    return {
      testId,
      attemptId,
      score,
      maxScore,
      correct,
      wrong,
      unattempted,
      perSubject,
      weakConcepts,
      persisted,
    };
  }

  /** EWMA blend of prior mastery with this attempt's per-concept accuracy. */
  private async recomputeMastery(
    tx: Database,
    userId: string,
    perConcept: Map<string, { correct: number; total: number }>,
  ): Promise<void> {
    for (const [conceptId, { correct, total }] of perConcept) {
      const batchAcc = total > 0 ? correct / total : 0;
      const [prior] = await tx
        .select()
        .from(mastery)
        .where(and(eq(mastery.userId, userId), eq(mastery.conceptId, conceptId)))
        .limit(1);
      const newScore = prior
        ? prior.score * (1 - EWMA_ALPHA) + batchAcc * EWMA_ALPHA
        : batchAcc;
      await tx
        .insert(mastery)
        .values({ userId, conceptId, score: newScore, attempts: total })
        .onConflictDoUpdate({
          target: [mastery.userId, mastery.conceptId],
          set: {
            score: newScore,
            attempts: sql`${mastery.attempts} + ${total}`,
            lastSeen: new Date(),
          },
        });
    }
  }

  private async weakFrom(
    perConcept: Map<string, { correct: number; total: number }>,
  ): Promise<ScoreResult["weakConcepts"]> {
    const ids = [...perConcept.keys()];
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: concepts.id, name: concepts.name })
      .from(concepts)
      .where(inArray(concepts.id, ids));
    const nameById = new Map(rows.map((r) => [r.id, r.name]));
    return [...perConcept.entries()]
      .map(([conceptId, { correct, total }]) => ({
        conceptId,
        name: nameById.get(conceptId) ?? "Unknown",
        accuracy: total > 0 ? correct / total : 0,
      }))
      .filter((c) => c.accuracy < WEAK_THRESHOLD)
      .sort((a, b) => a.accuracy - b.accuracy);
  }

  /** Current mastery map for a user, with concept names. */
  async getMastery(userId: string) {
    return this.db
      .select({
        conceptId: mastery.conceptId,
        name: concepts.name,
        score: mastery.score,
        attempts: mastery.attempts,
      })
      .from(mastery)
      .innerJoin(concepts, eq(concepts.id, mastery.conceptId))
      .where(eq(mastery.userId, userId));
  }
}
