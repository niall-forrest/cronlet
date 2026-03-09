import type { PlanTier } from "./types";

export const RATE_LIMITS = {
  apiGlobal: {
    key: "api_global",
    limit: 600,
    windowMs: 60 * 1000,
  },
  taskCreate: {
    key: "task_create",
    limit: 60,
    windowMs: 60 * 60 * 1000,
  },
  taskTrigger: {
    key: "task_trigger",
    limit: 120,
    windowMs: 60 * 60 * 1000,
  },
} as const;

export const MAX_TASK_HANDLER_STEPS = 10;
export const MAX_TASK_METADATA_BYTES = 16 * 1024;

export const TASK_LIMITS: Record<PlanTier, number> = {
  free: 10,
  pro: 100,
  team: 100,
};

export function getTaskLimitForTier(tier: PlanTier): number {
  return TASK_LIMITS[tier];
}

export function getMetadataSizeBytes(metadata: Record<string, unknown> | null | undefined): number {
  if (!metadata) {
    return 0;
  }

  return new TextEncoder().encode(JSON.stringify(metadata)).length;
}
