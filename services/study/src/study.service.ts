import { Inject, Injectable, Logger } from "@nestjs/common";
import { desc, eq } from "drizzle-orm";
import { studyPlans, type Database } from "@neet/db";
import type { PlanInput, PlanResult, StudyPlan } from "@neet/types";
import { DB } from "./db.module";
import { config } from "./config";

@Injectable()
export class StudyService {
  private readonly log = new Logger(StudyService.name);
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Generates a plan: fetch the learner's prediction (levers + score) from the
   * prediction service, ask the AI Planner to turn it into a schedule, persist.
   */
  async generatePlan(
    userId: string,
    token: string,
    horizonDays = 7,
  ): Promise<{ plan: StudyPlan; source: string }> {
    const prediction = await this.fetchPrediction(token);

    const input: PlanInput = {
      horizonDays,
      predictedScore: prediction.predictedScore,
      rankBand: prediction.rankBand,
      levers: prediction.levers,
    };

    const result = await this.callPlanner(input);

    await this.db.insert(studyPlans).values({
      userId,
      horizonDays,
      plan: result.plan,
      source: result.provider,
    });

    return { plan: result.plan, source: result.provider };
  }

  async getLatest(userId: string): Promise<{ plan: StudyPlan; source: string } | null> {
    const [row] = await this.db
      .select()
      .from(studyPlans)
      .where(eq(studyPlans.userId, userId))
      .orderBy(desc(studyPlans.createdAt))
      .limit(1);
    if (!row) return null;
    return { plan: row.plan as StudyPlan, source: row.source };
  }

  private async fetchPrediction(token: string): Promise<{
    predictedScore: number;
    rankBand: string;
    levers: PlanInput["levers"];
  }> {
    const res = await fetch(`${config.PREDICTION_URL}/api/v1/prediction`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`prediction fetch failed: ${res.status}`);
    return (await res.json()) as any;
  }

  private async callPlanner(input: PlanInput): Promise<PlanResult> {
    const res = await fetch(`${config.AI_URL}/api/v1/ai/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`planner failed: ${res.status}`);
    return (await res.json()) as PlanResult;
  }
}
