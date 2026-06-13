import type { PlanInput, StudyPlan } from "@neet/types";

export const PLANNER_SYSTEM = `You are NEET AI Planner. Given a student's predicted score and their weakest
concepts ("levers", each with potential mark gain), produce a focused day-by-day
study plan that prioritises the highest-leverage weak concepts first and
interleaves spaced revision of earlier days.

Respond with ONLY a JSON object, no prose, matching exactly:
{"summary": string,
 "days": [{"day": number, "focus": string,
           "tasks": [{"type": "study"|"practice"|"revise", "concept": string, "minutes": number}]}]}`;

export function planUserPrompt(input: PlanInput): string {
  const levers = input.levers
    .map((l) => `- ${l.name} (mastery ${Math.round(l.currentMastery * 100)}%, +${l.potentialGain} marks)`)
    .join("\n");
  return `Predicted score: ${input.predictedScore}/720 (rank ${input.rankBand}).
Horizon: ${input.horizonDays} days.
Weakest concepts to target:
${levers}

Build the ${input.horizonDays}-day plan now.`;
}

/**
 * Deterministic planner — also the fallback when no AI provider is available.
 * Highest-gain concept becomes each day's focus (round-robin), with study +
 * practice of the focus and spaced revision of the previous day's focus.
 */
export function buildPlanDeterministic(input: PlanInput): StudyPlan {
  const levers = [...input.levers].sort((a, b) => b.potentialGain - a.potentialGain);
  const horizon = input.horizonDays;
  const pool = levers.length ? levers : [{ name: "General revision", conceptId: "", currentMastery: 0, potentialGain: 0 }];

  const days = Array.from({ length: horizon }, (_, i) => {
    const focus = pool[i % pool.length].name;
    const prevFocus = i > 0 ? pool[(i - 1) % pool.length].name : null;
    const tasks: StudyPlan["days"][number]["tasks"] = [
      { type: "study", concept: focus, minutes: 40 },
      { type: "practice", concept: focus, minutes: 30 },
    ];
    if (prevFocus) tasks.push({ type: "revise", concept: prevFocus, minutes: 20 });
    return { day: i + 1, focus, tasks };
  });

  const top = pool.slice(0, 3).map((l) => l.name).join(", ");
  const summary =
    `A ${horizon}-day plan targeting your highest-leverage gaps (${top}). ` +
    `Master these to move from ${input.predictedScore}/720 toward your target. ` +
    `Each day: learn the concept, practise it, then revise the previous day's topic.`;

  return { summary, days };
}
