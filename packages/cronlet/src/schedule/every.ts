import type { IntervalString, IntervalUnit } from "./types.js";
import { createScheduleBuilder, type ScheduleBuilder } from "./types.js";

/**
 * Parse an interval string into value and unit
 */
function parseInterval(interval: IntervalString): { value: number; unit: IntervalUnit } {
  const match = interval.match(/^(\d+)([smhdw])$/);
  if (!match) {
    throw new Error(
      `Invalid interval format: "${interval}". Expected format: number + unit (s/m/h/d/w). Examples: "15m", "2h", "1d"`
    );
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2] as IntervalUnit;

  if (value <= 0) {
    throw new Error(`Interval value must be positive, got: ${value}`);
  }

  return { value, unit };
}

/**
 * Convert interval to cron expression
 * Note: Cron has limitations for intervals - we use the closest approximation
 */
function intervalToCron(value: number, unit: IntervalUnit): string {
  switch (unit) {
    case "s":
      // Cron doesn't support seconds natively, but some implementations do
      // We'll use a special format that the scheduler can interpret
      if (value < 60) {
        return `*/${value} * * * * *`; // 6-field cron with seconds
      }
      // Convert to minutes if >= 60 seconds
      return intervalToCron(Math.ceil(value / 60), "m");

    case "m":
      if (value < 60) {
        return `*/${value} * * * *`;
      }
      // Convert to hours if >= 60 minutes
      return intervalToCron(Math.ceil(value / 60), "h");

    case "h":
      if (value < 24) {
        return `0 */${value} * * *`;
      }
      // Convert to days if >= 24 hours
      return intervalToCron(Math.ceil(value / 24), "d");

    case "d":
      if (value === 1) {
        return "0 0 * * *"; // Daily at midnight
      }
      // Every N days - use day of month (approximate)
      return `0 0 */${value} * *`;

    case "w":
      if (value === 1) {
        return "0 0 * * 0"; // Weekly on Sunday
      }
      // Every N weeks - approximate with days
      return intervalToCron(value * 7, "d");

    default:
      throw new Error(`Unknown interval unit: ${unit}`);
  }
}

/**
 * Generate human-readable description for interval
 */
function intervalToHumanReadable(value: number, unit: IntervalUnit): string {
  const unitNames: Record<IntervalUnit, [string, string]> = {
    s: ["second", "seconds"],
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    d: ["day", "days"],
    w: ["week", "weeks"],
  };

  const [singular, plural] = unitNames[unit];
  const unitName = value === 1 ? singular : plural;

  return `every ${value} ${unitName}`;
}

/**
 * Create an interval-based schedule
 *
 * @param interval - Interval string (e.g., "15m", "2h", "1d")
 * @returns ScheduleBuilder
 *
 * @example
 * ```ts
 * every("15m")  // every 15 minutes
 * every("2h")   // every 2 hours
 * every("1d")   // every day
 * every("1w")   // every week
 * ```
 */
export function every(interval: IntervalString): ScheduleBuilder {
  const { value, unit } = parseInterval(interval);

  return createScheduleBuilder({
    type: "interval",
    cron: intervalToCron(value, unit),
    humanReadable: intervalToHumanReadable(value, unit),
    originalParams: { interval },
  });
}
