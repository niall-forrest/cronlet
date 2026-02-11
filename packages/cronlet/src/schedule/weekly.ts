import type { DayOfWeek, TimeString } from "./types.js";
import { createScheduleBuilder, type ScheduleBuilder } from "./types.js";
import { parseTime, formatTime12Hour, dayOfWeekToCron, dayOfWeekToName } from "./utils.js";

/**
 * Create a weekly schedule on specific day(s) at a specific time
 *
 * @param days - Day of week or array of days
 * @param time - Time in 24-hour format
 * @returns ScheduleBuilder
 *
 * @example
 * ```ts
 * weekly("fri", "09:00")                    // every Friday at 9:00 AM
 * weekly(["mon", "wed", "fri"], "09:00")    // Mon, Wed, Fri at 9:00 AM
 * weekly("sun", "00:00")                    // every Sunday at midnight
 * ```
 */
export function weekly(
  days: DayOfWeek | DayOfWeek[],
  time: TimeString
): ScheduleBuilder {
  // Normalize days to array
  const dayArray = Array.isArray(days) ? days : [days];

  if (dayArray.length === 0) {
    throw new Error("weekly() requires at least one day");
  }

  // Validate days
  const validDays: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  for (const day of dayArray) {
    if (!validDays.includes(day)) {
      throw new Error(
        `Invalid day of week: "${day}". Expected one of: ${validDays.join(", ")}`
      );
    }
  }

  // Parse time
  const parsedTime = parseTime(time);
  if (!parsedTime) {
    throw new Error(
      `Invalid time format: "${time}". Expected 24-hour format like "09:00" or "17:30"`
    );
  }

  // Convert days to cron numbers and sort
  const cronDays = dayArray
    .map((d) => dayOfWeekToCron[d])
    .sort((a, b) => a - b);

  // Generate cron expression
  const cron = `${parsedTime.minute} ${parsedTime.hour} * * ${cronDays.join(",")}`;

  // Generate human-readable description
  const timeStr = formatTime12Hour(parsedTime.hour, parsedTime.minute);
  const dayNames = dayArray.map((d) => dayOfWeekToName[d]);

  let humanReadable: string;
  if (dayNames.length === 1) {
    humanReadable = `every ${dayNames[0]} at ${timeStr}`;
  } else if (dayNames.length === 2) {
    humanReadable = `every ${dayNames[0]} and ${dayNames[1]} at ${timeStr}`;
  } else {
    const last = dayNames.pop();
    humanReadable = `every ${dayNames.join(", ")}, and ${last} at ${timeStr}`;
  }

  return createScheduleBuilder({
    type: "weekly",
    cron,
    humanReadable,
    originalParams: { days: dayArray, time },
  });
}
