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

/**
 * Parse a duration string like "30s", "5m", "1h", "100ms" into milliseconds
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}
