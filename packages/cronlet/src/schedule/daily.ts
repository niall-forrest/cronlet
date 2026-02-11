import type { TimeString } from "./types.js";
import { createScheduleBuilder, type ScheduleBuilder } from "./types.js";
import { parseTime, formatTime12Hour } from "./utils.js";

/**
 * Create a daily schedule at specific time(s)
 *
 * @param times - One or more times in 24-hour format (e.g., "09:00", "17:30")
 * @returns ScheduleBuilder
 *
 * @example
 * ```ts
 * daily("09:00")              // every day at 9:00 AM
 * daily("09:00", "17:00")     // every day at 9:00 AM and 5:00 PM
 * daily("00:00")              // every day at midnight
 * ```
 */
export function daily(...times: [TimeString, ...TimeString[]]): ScheduleBuilder {
  if (times.length === 0) {
    throw new Error("daily() requires at least one time argument");
  }

  // Parse and validate all times
  const parsedTimes = times.map((time) => {
    const parsed = parseTime(time);
    if (!parsed) {
      throw new Error(
        `Invalid time format: "${time}". Expected 24-hour format like "09:00" or "17:30"`
      );
    }
    return parsed;
  });

  // Generate cron expression
  // If multiple times, we need to list them: "0 9,17 * * *" for 9:00 and 17:00
  const hours = [...new Set(parsedTimes.map((t) => t.hour))].sort((a, b) => a - b);
  const minutes = [...new Set(parsedTimes.map((t) => t.minute))].sort((a, b) => a - b);

  let cron: string;
  if (parsedTimes.length === 1) {
    // Single time - straightforward
    cron = `${parsedTimes[0]!.minute} ${parsedTimes[0]!.hour} * * *`;
  } else if (minutes.length === 1) {
    // All times have same minute, different hours: "0 9,17 * * *"
    cron = `${minutes[0]} ${hours.join(",")} * * *`;
  } else if (hours.length === 1) {
    // All times have same hour, different minutes: "0,30 9 * * *"
    cron = `${minutes.join(",")} ${hours[0]} * * *`;
  } else {
    // Multiple times with different hours AND minutes can't be expressed in a single cron
    // e.g., "09:30" and "17:45" would need two separate cron jobs
    throw new Error(
      `daily() with multiple times requires either the same hour or same minute. ` +
      `Got times with different hours and minutes: ${times.join(", ")}. ` +
      `Create separate schedules instead.`
    );
  }

  // Generate human-readable description
  const timeStrings = parsedTimes.map((t) => formatTime12Hour(t.hour, t.minute));
  let humanReadable: string;
  if (timeStrings.length === 1) {
    humanReadable = `daily at ${timeStrings[0]}`;
  } else if (timeStrings.length === 2) {
    humanReadable = `daily at ${timeStrings[0]} and ${timeStrings[1]}`;
  } else {
    const last = timeStrings.pop();
    humanReadable = `daily at ${timeStrings.join(", ")}, and ${last}`;
  }

  return createScheduleBuilder({
    type: "daily",
    cron,
    humanReadable,
    originalParams: { times },
  });
}
