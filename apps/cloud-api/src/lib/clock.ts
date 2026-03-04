import { Cron } from "croner";
import type { ScheduleConfig } from "@cronlet/cloud-shared";

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Convert a ScheduleConfig to a cron expression
 */
export function scheduleToCron(config: ScheduleConfig): string {
  switch (config.type) {
    case "cron":
      return config.expression;

    case "every": {
      // Parse interval like "5m", "1h", "15s"
      const match = config.interval.match(/^(\d+)(s|m|h|d)$/);
      if (!match || !match[1] || !match[2]) {
        throw new Error(`Invalid interval format: ${config.interval}`);
      }
      const value = parseInt(match[1], 10);
      const unit = match[2];

      switch (unit) {
        case "s":
          // Every N seconds - use */N in seconds field
          // Note: Standard cron doesn't support seconds, croner does
          return `*/${value} * * * * *`;
        case "m":
          return `*/${value} * * * *`;
        case "h":
          return `0 */${value} * * *`;
        case "d":
          return `0 0 */${value} * *`;
        default:
          throw new Error(`Unknown interval unit: ${unit}`);
      }
    }

    case "daily": {
      // Multiple times per day - use the first time
      const timeStr = config.times[0];
      if (!timeStr) {
        throw new Error("Daily schedule requires at least one time");
      }
      const parts = timeStr.split(":");
      const hour = Number(parts[0]);
      const minute = Number(parts[1]);
      return `${minute} ${hour} * * *`;
    }

    case "weekly": {
      const [hour, minute] = config.time.split(":").map(Number);
      const dayMap: Record<string, number> = {
        sun: 0,
        mon: 1,
        tue: 2,
        wed: 3,
        thu: 4,
        fri: 5,
        sat: 6,
      };
      const days = config.days.map((d) => dayMap[d]).join(",");
      return `${minute} ${hour} * * ${days}`;
    }

    case "monthly": {
      const [hour, minute] = config.time.split(":").map(Number);

      if (typeof config.day === "number") {
        return `${minute} ${hour} ${config.day} * *`;
      }

      // Handle "last" and "last-XXX" patterns
      if (config.day === "last") {
        // Last day of month - croner supports "L"
        return `${minute} ${hour} L * *`;
      }

      // last-fri, last-mon, etc.
      const lastDayMatch = config.day.match(/^last-(mon|tue|wed|thu|fri|sat|sun)$/);
      if (lastDayMatch && lastDayMatch[1]) {
        const dayMap: Record<string, number> = {
          sun: 0,
          mon: 1,
          tue: 2,
          wed: 3,
          thu: 4,
          fri: 5,
          sat: 6,
        };
        const dayNum = dayMap[lastDayMatch[1]];
        // Croner supports "L" for last, combined with day of week
        return `${minute} ${hour} * * ${dayNum}L`;
      }

      throw new Error(`Unknown monthly day format: ${config.day}`);
    }

    case "once": {
      // For one-time schedules, we compute the exact time
      // Return a cron that will match that exact time
      // This is a hack - we'll handle "once" specially in computeNextRun
      const date = new Date(config.at);
      const minute = date.getUTCMinutes();
      const hour = date.getUTCHours();
      const dayOfMonth = date.getUTCDate();
      const month = date.getUTCMonth() + 1;
      return `${minute} ${hour} ${dayOfMonth} ${month} *`;
    }

    default:
      throw new Error(`Unknown schedule type: ${(config as ScheduleConfig).type}`);
  }
}

/**
 * Compute the next run time for a cron expression
 */
export function computeNextRunFromCron(cron: string, timezone: string, from = new Date()): string | null {
  const schedule = new Cron(cron, {
    timezone,
    paused: true,
  });

  const next = schedule.nextRun(from);
  schedule.stop();
  return next ? next.toISOString() : null;
}

/**
 * Compute the next run time for a ScheduleConfig
 */
export function computeNextRun(config: ScheduleConfig, timezone: string, from = new Date()): string | null {
  // Handle "once" specially - if the time has passed, return null
  if (config.type === "once") {
    const targetTime = new Date(config.at);
    if (targetTime.getTime() <= from.getTime()) {
      return null;
    }
    return config.at;
  }

  const cron = scheduleToCron(config);
  return computeNextRunFromCron(cron, timezone, from);
}

