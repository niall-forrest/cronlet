import { Cron } from "croner";

export function nowIso(): string {
  return new Date().toISOString();
}

export function computeNextRun(cron: string, timezone: string, from = new Date()): string | null {
  const schedule = new Cron(cron, {
    timezone,
    paused: true,
  });

  const next = schedule.nextRun(from);
  schedule.stop();
  return next ? next.toISOString() : null;
}
