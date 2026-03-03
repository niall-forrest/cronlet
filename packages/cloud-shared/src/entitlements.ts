import type { PlanTier } from "./types";

export interface PlanLimits {
  runAttemptsPerMonth: number;
  retentionDays: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    runAttemptsPerMonth: 1000,
    retentionDays: 7,
  },
  pro: {
    runAttemptsPerMonth: 25000,
    retentionDays: 90,
  },
  team: {
    runAttemptsPerMonth: 100000,
    retentionDays: 365,
  },
};

export function isWithinRunLimit(plan: PlanTier, currentAttempts: number): boolean {
  return currentAttempts < PLAN_LIMITS[plan].runAttemptsPerMonth;
}

export function formatYearMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
