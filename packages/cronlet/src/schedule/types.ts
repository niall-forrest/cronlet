/**
 * Interval unit for schedule expressions
 * - s: seconds
 * - m: minutes
 * - h: hours
 * - d: days
 * - w: weeks
 */
export type IntervalUnit = "s" | "m" | "h" | "d" | "w";

/**
 * Interval string format: number followed by unit
 * Examples: "15m", "2h", "1d", "30s"
 */
export type IntervalString = `${number}${IntervalUnit}`;

/**
 * Time string in 24-hour format
 * Examples: "09:00", "17:30", "00:00"
 */
export type TimeString = `${number}:${number}` | `${number}${number}:${number}${number}`;

/**
 * Days of the week (lowercase, 3-letter abbreviations)
 */
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * Monthly day specification
 * - number (1-31): specific day of month
 * - "last-{day}": last occurrence of a weekday in the month
 */
export type MonthlyDay = number | `last-${DayOfWeek}`;

/**
 * Schedule type identifier
 */
export type ScheduleType = "interval" | "daily" | "weekly" | "monthly" | "cron";

/**
 * Internal schedule descriptor - the compiled representation of any schedule
 */
export interface ScheduleDescriptor {
  /** The type of schedule */
  type: ScheduleType;
  /** The cron expression (all schedules compile to cron) */
  cron: string;
  /** Optional timezone (IANA format) */
  timezone?: string;
  /** Human-readable description of the schedule */
  humanReadable: string;
  /** Original parameters used to create the schedule (for debugging) */
  originalParams: Record<string, unknown>;
}

/**
 * Schedule builder with chainable methods
 */
export interface ScheduleBuilder {
  /** The type of schedule */
  type: ScheduleType;
  /** The cron expression (all schedules compile to cron) */
  cron: string;
  /** Optional timezone (IANA format) - the value */
  timezone?: string;
  /** Human-readable description of the schedule */
  humanReadable: string;
  /** Original parameters used to create the schedule (for debugging) */
  originalParams: Record<string, unknown>;
  /**
   * Set the timezone for this schedule
   * @param tz - IANA timezone string (e.g., "America/New_York", "Europe/London")
   */
  withTimezone(tz: string): ScheduleBuilder;
}

/**
 * Create a ScheduleBuilder from a ScheduleDescriptor
 */
export function createScheduleBuilder(
  descriptor: ScheduleDescriptor
): ScheduleBuilder {
  return {
    type: descriptor.type,
    cron: descriptor.cron,
    timezone: descriptor.timezone,
    humanReadable: descriptor.humanReadable,
    originalParams: descriptor.originalParams,
    withTimezone(tz: string): ScheduleBuilder {
      return createScheduleBuilder({
        ...descriptor,
        timezone: tz,
      });
    },
  };
}
