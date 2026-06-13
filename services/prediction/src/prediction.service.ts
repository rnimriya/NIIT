import { Inject, Injectable } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import {
  concepts,
  chapters,
  mastery,
  predictions,
  type Database,
} from "@neet/db";
import { DB } from "./db.module";

const NEET_MAX = 720; // 180 questions × 4 marks
const MODEL_VERSION = "heuristic-v1";
const LEVER_THRESHOLD = 0.7; // concepts below this are improvement candidates

export interface Lever {
  conceptId: string;
  name: string;
  currentMastery: number;
  potentialGain: number; // marks gained if mastered to 1.0
}

export interface PredictionResult {
  predictedScore: number;
  rankBand: string;
  confidence: number;
  weightedMastery: number;
  coverage: number;
  levers: Lever[];
  modelVersion: string;
  createdAt?: string;
}

/** Approximate NEET score → All-India rank band (illustrative cutoffs). */
function rankBand(score: number): string {
  if (score >= 680) return "Top 100";
  if (score >= 650) return "100 – 1,000";
  if (score >= 620) return "1,000 – 5,000";
  if (score >= 580) return "5,000 – 20,000";
  if (score >= 520) return "20,000 – 60,000";
  if (score >= 450) return "60,000 – 1,50,000";
  return "1,50,000+";
}

@Injectable()
export class PredictionService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Computes a fresh prediction from current mastery and persists it. */
  async compute(userId: string): Promise<PredictionResult> {
    // Every concept in the syllabus, with its chapter weight.
    const allConcepts = await this.db
      .select({
        id: concepts.id,
        name: concepts.name,
        weight: chapters.weight,
      })
      .from(concepts)
      .innerJoin(chapters, eq(chapters.id, concepts.chapterId));

    const masteryRows = await this.db
      .select({ conceptId: mastery.conceptId, score: mastery.score })
      .from(mastery)
      .where(eq(mastery.userId, userId));
    const masteryById = new Map(masteryRows.map((m) => [m.conceptId, m.score]));

    const totalWeight = allConcepts.reduce((s, c) => s + (c.weight ?? 1), 0) || 1;

    // Weighted mastery over the WHOLE syllabus — unseen concepts count as 0,
    // so the predicted score rises as coverage and accuracy improve.
    let weightedSum = 0;
    const levers: Lever[] = [];
    for (const c of allConcepts) {
      const w = c.weight ?? 1;
      const score = masteryById.get(c.id) ?? 0;
      weightedSum += score * w;
      if (score < LEVER_THRESHOLD) {
        levers.push({
          conceptId: c.id,
          name: c.name,
          currentMastery: Number(score.toFixed(2)),
          potentialGain: Math.round(((1 - score) * w) / totalWeight * NEET_MAX),
        });
      }
    }

    const weightedMastery = weightedSum / totalWeight;
    const predictedScore = Math.round(weightedMastery * NEET_MAX);
    const coverage = allConcepts.length ? masteryById.size / allConcepts.length : 0;
    // Confidence grows with syllabus coverage; capped — a model is never certain.
    const confidence = Math.min(0.95, 0.3 + 0.6 * coverage);

    levers.sort((a, b) => b.potentialGain - a.potentialGain);
    const topLevers = levers.slice(0, 5);

    const result: PredictionResult = {
      predictedScore,
      rankBand: rankBand(predictedScore),
      confidence: Number(confidence.toFixed(2)),
      weightedMastery: Number(weightedMastery.toFixed(3)),
      coverage: Number(coverage.toFixed(2)),
      levers: topLevers,
      modelVersion: MODEL_VERSION,
    };

    const [row] = await this.db
      .insert(predictions)
      .values({
        userId,
        predictedScore: result.predictedScore,
        rankBand: result.rankBand,
        confidence: result.confidence,
        weightedMastery: result.weightedMastery,
        coverage: result.coverage,
        levers: result.levers,
        modelVersion: MODEL_VERSION,
      })
      .returning();

    return { ...result, createdAt: row.createdAt.toISOString() };
  }

  /** Latest stored prediction, if any (cheap read for the dashboard). */
  async latest(userId: string): Promise<PredictionResult | null> {
    const [row] = await this.db
      .select()
      .from(predictions)
      .where(eq(predictions.userId, userId))
      .orderBy(desc(predictions.createdAt))
      .limit(1);
    if (!row) return null;
    return {
      predictedScore: row.predictedScore,
      rankBand: row.rankBand,
      confidence: row.confidence,
      weightedMastery: row.weightedMastery,
      coverage: row.coverage,
      levers: row.levers as Lever[],
      modelVersion: row.modelVersion,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
