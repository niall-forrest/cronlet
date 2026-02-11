import { createScheduleBuilder, type ScheduleBuilder } from "./types.js";

/**
 * Validate a cron expression (basic validation)
 */
function validateCronExpression(expression: string): boolean {
  // Split by whitespace
  const parts = expression.trim().split(/\s+/);

  // Standard cron has 5 fields, but we also support 6-field (with seconds)
  if (parts.length !== 5 && parts.length !== 6) {
    return false;
  }

  // Basic validation: each field should contain valid cron characters
  const validPattern = /^[\d*,/\-LW#]+$/;
  return parts.every((part) => validPattern.test(part));
}

/**
 * Generate a human-readable description from a cron expression
 * This is a simplified version - full cron-to-human is complex
 */
function cronToHumanReadable(expression: string): string {
  const parts = expression.trim().split(/\s+/);

  // Handle some common patterns
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Every minute: * * * * *
    if (minute === "*" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "every minute";
    }

    // Every N minutes: */N * * * *
    if (minute?.startsWith("*/") && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      const n = minute.slice(2);
      return `every ${n} minutes`;
    }

    // Every hour at minute 0: 0 * * * *
    if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      return "every hour";
    }

    // Every N hours: 0 */N * * *
    if (minute === "0" && hour?.startsWith("*/") && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      const n = hour.slice(2);
      return `every ${n} hours`;
    }

    // Daily at specific time: M H * * *
    if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*" && minute && hour && !minute.includes("*") && !hour.includes("*")) {
      const h = parseInt(hour, 10);
      const m = parseInt(minute, 10);
      const period = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `daily at ${h12}:${m.toString().padStart(2, "0")} ${period}`;
    }
  }

  // Fallback: just return the expression
  return `cron: ${expression}`;
}

/**
 * Create a schedule from a raw cron expression
 *
 * @param expression - Standard cron expression (5 or 6 fields)
 * @returns ScheduleBuilder
 *
 * @example
 * ```ts
 * cron("0 9 * * 1-5")     // 9 AM on weekdays
 * cron("0 0 1 * *")       // midnight on 1st of month
 * cron("*\/15 * * * *")   // every 15 minutes
 * ```
 */
export function cron(expression: string): ScheduleBuilder {
  const trimmed = expression.trim();

  if (!validateCronExpression(trimmed)) {
    throw new Error(
      `Invalid cron expression: "${expression}". Expected 5 or 6 space-separated fields.`
    );
  }

  return createScheduleBuilder({
    type: "cron",
    cron: trimmed,
    humanReadable: cronToHumanReadable(trimmed),
    originalParams: { expression: trimmed },
  });
}
