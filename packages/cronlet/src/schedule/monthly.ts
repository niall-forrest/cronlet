import type { DayOfWeek, MonthlyDay, TimeString } from "./types.js";
import { createScheduleBuilder, type ScheduleBuilder } from "./types.js";
import {
  parseTime,
  formatTime12Hour,
  dayOfWeekToCron,
  dayOfWeekToName,
  isValidDayOfMonth,
  getOrdinalSuffix,
} from "./utils.js";

/**
 * Parse a "last-{day}" string
 */
function parseLastDay(day: string): DayOfWeek | null {
  const match = day.match(/^last-(mon|tue|wed|thu|fri|sat|sun)$/);
  if (match) {
    return match[1] as DayOfWeek;
  }
  return null;
}

/**
 * Create a monthly schedule on a specific day at a specific time
 *
 * @param day - Day of month (1-31) or "last-{weekday}" for last occurrence
 * @param time - Time in 24-hour format
 * @returns ScheduleBuilder
 *
 * @example
 * ```ts
 * monthly(1, "09:00")              // 1st of every month at 9:00 AM
 * monthly(15, "12:00")             // 15th of every month at noon
 * monthly("last-friday", "17:00")  // last Friday of every month at 5:00 PM
 * ```
 */
export function monthly(day: MonthlyDay, time: TimeString): ScheduleBuilder {
  // Parse time
  const parsedTime = parseTime(time);
  if (!parsedTime) {
    throw new Error(
      `Invalid time format: "${time}". Expected 24-hour format like "09:00" or "17:30"`
    );
  }

  const timeStr = formatTime12Hour(parsedTime.hour, parsedTime.minute);
  let cron: string;
  let humanReadable: string;

  if (typeof day === "number") {
    // Specific day of month
    if (!isValidDayOfMonth(day)) {
      throw new Error(
        `Invalid day of month: ${day}. Expected a number between 1 and 31`
      );
    }

    cron = `${parsedTime.minute} ${parsedTime.hour} ${day} * *`;
    humanReadable = `${getOrdinalSuffix(day)} of every month at ${timeStr}`;
  } else {
    // "last-{weekday}" format
    const lastDay = parseLastDay(day);
    if (!lastDay) {
      throw new Error(
        `Invalid monthly day format: "${day}". Expected a number (1-31) or "last-{weekday}" (e.g., "last-friday")`
      );
    }

    // For "last X of month", we need a special cron expression
    // Standard cron can't express this directly, but we can use "L" in some implementations
    // We'll use a format that the scheduler can interpret: day#L or just store the info
    // For compatibility, we'll use the weekday and note it's the last occurrence
    const cronDay = dayOfWeekToCron[lastDay];

    // Using the "weekday#occurrence" format where L = last
    // Some cron implementations support: 5L = last Friday
    // We'll use: minute hour * * weekdayL
    cron = `${parsedTime.minute} ${parsedTime.hour} * * ${cronDay}L`;

    const dayName = dayOfWeekToName[lastDay];
    humanReadable = `last ${dayName} of every month at ${timeStr}`;
  }

  return createScheduleBuilder({
    type: "monthly",
    cron,
    humanReadable,
    originalParams: { day, time },
  });
}
