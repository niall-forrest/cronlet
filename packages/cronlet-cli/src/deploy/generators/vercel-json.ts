import type { JobDefinition } from "cronlet";
import { flattenJobId } from "../validation.js";

export interface VercelCronEntry {
  path: string;
  schedule: string;
}

export interface VercelConfig {
  crons?: VercelCronEntry[];
  [key: string]: unknown;
}

/**
 * Generate cron entries for Vercel
 */
export function generateCronEntries(
  jobs: JobDefinition[],
  prefix: string = "/api/cron"
): VercelCronEntry[] {
  return jobs.map((job) => ({
    path: `${prefix}/${flattenJobId(job.id)}`,
    schedule: job.schedule.cron,
  }));
}

/**
 * Merge new cron entries with existing vercel.json config
 *
 * Strategy:
 * - Replace all cron entries that match the prefix pattern
 * - Keep other cron entries (user's manual entries)
 * - Preserve all other vercel.json configuration
 */
export function mergeVercelConfig(
  existing: VercelConfig | null,
  newEntries: VercelCronEntry[],
  prefix: string = "/api/cron"
): VercelConfig {
  if (!existing) {
    return { crons: newEntries };
  }

  // Separate existing crons into cronlet-managed and user-managed
  const existingCrons = existing.crons ?? [];
  const userCrons = existingCrons.filter(
    (cron) => !cron.path.startsWith(prefix)
  );

  // Merge: user crons + new cronlet crons
  const mergedCrons = [...userCrons, ...newEntries];

  return {
    ...existing,
    crons: mergedCrons.length > 0 ? mergedCrons : undefined,
  };
}

/**
 * Get removed cron entries (for cleanup reporting)
 */
export function getRemovedCrons(
  existing: VercelConfig | null,
  newEntries: VercelCronEntry[],
  prefix: string = "/api/cron"
): VercelCronEntry[] {
  if (!existing || !existing.crons) {
    return [];
  }

  const newPaths = new Set(newEntries.map((e) => e.path));

  return existing.crons.filter(
    (cron) => cron.path.startsWith(prefix) && !newPaths.has(cron.path)
  );
}

/**
 * Get added cron entries (for reporting)
 */
export function getAddedCrons(
  existing: VercelConfig | null,
  newEntries: VercelCronEntry[],
  _prefix: string = "/api/cron"
): VercelCronEntry[] {
  if (!existing || !existing.crons) {
    return newEntries;
  }

  const existingPaths = new Set(existing.crons.map((e) => e.path));

  return newEntries.filter((cron) => !existingPaths.has(cron.path));
}

/**
 * Get updated cron entries (schedule changed)
 */
export function getUpdatedCrons(
  existing: VercelConfig | null,
  newEntries: VercelCronEntry[]
): VercelCronEntry[] {
  if (!existing || !existing.crons) {
    return [];
  }

  const existingMap = new Map(existing.crons.map((e) => [e.path, e.schedule]));

  return newEntries.filter((cron) => {
    const existingSchedule = existingMap.get(cron.path);
    return existingSchedule !== undefined && existingSchedule !== cron.schedule;
  });
}
