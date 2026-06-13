import type { Entitlements, PlanTier } from "@neet/types";

/** Feature entitlements per plan tier — the single source of truth for gating. */
export const PLAN_FEATURES: Record<PlanTier, Entitlements> = {
  free: { plan: "free", aiTutorOpus: false, planHorizonMax: 3, mocksPerWeek: 2 },
  plus: { plan: "plus", aiTutorOpus: true, planHorizonMax: 14, mocksPerWeek: 14 },
  pro: { plan: "pro", aiTutorOpus: true, planHorizonMax: 90, mocksPerWeek: 999 },
};

/** Display catalog for the pricing page. */
export const PLAN_CATALOG = [
  {
    plan: "free" as PlanTier,
    name: "Free",
    priceInr: 0,
    features: ["Sonnet tutor", "3-day study plans", "2 mocks / week"],
  },
  {
    plan: "plus" as PlanTier,
    name: "Plus",
    priceInr: 499,
    features: ["Opus tutor (hard doubts)", "14-day plans", "14 mocks / week"],
  },
  {
    plan: "pro" as PlanTier,
    name: "Pro",
    priceInr: 999,
    features: ["Opus tutor", "90-day plans", "Unlimited mocks"],
  },
];
