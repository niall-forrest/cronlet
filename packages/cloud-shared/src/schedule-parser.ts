import type { ScheduleConfig } from "./types";
import { scheduleConfigSchema } from "./schemas";

export const SUPPORTED_SCHEDULE_EXAMPLES = [
  "every 15 minutes",
  "daily at 9am",
  "weekdays at 5pm",
  "every friday at 9am",
  "monthly on the last friday at 9am",
  "once at 2026-03-15 09:00",
] as const;

export type SupportedScheduleExample = (typeof SUPPORTED_SCHEDULE_EXAMPLES)[number];

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type ScheduleParseErrorCode =
  | "UNSUPPORTED_SCHEDULE"
  | "INVALID_SCHEDULE_OBJECT"
  | "INVALID_SCHEDULE_INPUT";

export interface ScheduleParseSuccess {
  success: true;
  config: ScheduleConfig;
  preview: string;
}

export interface ScheduleParseFailure {
  success: false;
  code: ScheduleParseErrorCode;
  error: string;
  examples: readonly SupportedScheduleExample[];
}

export type ScheduleParseResult = ScheduleParseSuccess | ScheduleParseFailure;

export class ScheduleParseError extends Error {
  readonly code: ScheduleParseErrorCode;
  readonly input: unknown;
  readonly examples: readonly SupportedScheduleExample[];

  constructor(input: unknown, message: string, code: ScheduleParseErrorCode = "UNSUPPORTED_SCHEDULE") {
    super(message);
    this.name = "ScheduleParseError";
    this.code = code;
    this.input = input;
    this.examples = SUPPORTED_SCHEDULE_EXAMPLES;
  }
}

const DAY_MAP: Record<string, DayOfWeek> = {
  monday: "mon",
  mon: "mon",
  tuesday: "tue",
  tue: "tue",
  wednesday: "wed",
  wed: "wed",
  thursday: "thu",
  thu: "thu",
  friday: "fri",
  fri: "fri",
  saturday: "sat",
  sat: "sat",
  sunday: "sun",
  sun: "sun",
};

const WEEKDAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEK_ORDER: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function parseSchedule(description: string): ScheduleParseResult {
  const input = description.trim();
  const normalized = input.toLowerCase();

  const parsers = [
    parseEveryInterval,
    parseDailyAt,
    parseWeekdaysAt,
    parseWeeklyAt,
    parseMonthlyOn,
    parseOnceAt,
  ];

  for (const parser of parsers) {
    const result = parser(normalized);
    if (result) {
      return result;
    }
  }

  return unsupportedSchedule(input);
}

export function resolveSchedule(input: unknown): ScheduleParseResult {
  const parsedObject = scheduleConfigSchema.safeParse(input);
  if (parsedObject.success) {
    return {
      success: true,
      config: parsedObject.data,
      preview: formatSchedulePreview(parsedObject.data),
    };
  }

  if (typeof input === "string") {
    return parseSchedule(input);
  }

  return {
    success: false,
    code: "INVALID_SCHEDULE_INPUT",
    error: unsupportedMessage("Schedule must be a schedule object or a supported schedule string."),
    examples: SUPPORTED_SCHEDULE_EXAMPLES,
  };
}

function parseEveryInterval(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^every\s+(\d+)\s*(seconds?|minutes?|hours?|days?)$/i);
  if (!match || !match[1] || !match[2]) return null;

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isInteger(amount) || amount < 1) {
    return null;
  }

  const unit = match[2].toLowerCase();
  let interval: string;
  let unitLabel: string;

  if (unit.startsWith("second")) {
    interval = `${amount}s`;
    unitLabel = amount === 1 ? "second" : "seconds";
  } else if (unit.startsWith("minute")) {
    interval = `${amount}m`;
    unitLabel = amount === 1 ? "minute" : "minutes";
  } else if (unit.startsWith("hour")) {
    interval = `${amount}h`;
    unitLabel = amount === 1 ? "hour" : "hours";
  } else if (unit.startsWith("day")) {
    interval = `${amount}d`;
    unitLabel = amount === 1 ? "day" : "days";
  } else {
    return null;
  }

  return {
    success: true,
    config: { type: "every", interval },
    preview: `Runs every ${amount} ${unitLabel}`,
  };
}

function parseDailyAt(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^daily\s+at\s+(.+)$/i);
  if (!match || !match[1]) return null;

  const time = parseTime(match[1]);
  if (!time) return null;

  return {
    success: true,
    config: { type: "daily", times: [time] },
    preview: `Runs daily at ${time}`,
  };
}

function parseWeekdaysAt(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^weekdays\s+at\s+(.+)$/i);
  if (!match || !match[1]) return null;

  const time = parseTime(match[1]);
  if (!time) return null;

  return {
    success: true,
    config: { type: "weekly", days: WEEKDAYS, time },
    preview: `Runs weekdays at ${time}`,
  };
}

function parseWeeklyAt(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^(?:every|weekly\s+on)\s+([a-z]+)\s+at\s+(.+)$/i);
  if (!match || !match[1] || !match[2]) return null;

  const day = DAY_MAP[match[1].toLowerCase()];
  if (!day) return null;

  const time = parseTime(match[2]);
  if (!time) return null;

  return {
    success: true,
    config: { type: "weekly", days: [day], time },
    preview: `Runs every ${capitalize(match[1].toLowerCase())} at ${time}`,
  };
}

function parseMonthlyOn(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^monthly\s+on\s+(?:the\s+)?(.+?)\s+at\s+(.+)$/i);
  if (!match || !match[1] || !match[2]) return null;

  const dayPart = match[1].trim().toLowerCase();
  const time = parseTime(match[2]);
  if (!time) return null;

  const lastDayMatch = dayPart.match(/^last\s+([a-z]+)$/);
  if (lastDayMatch && lastDayMatch[1]) {
    const day = DAY_MAP[lastDayMatch[1]];
    if (!day) return null;

    return {
      success: true,
      config: { type: "monthly", day: `last-${day}`, time },
      preview: `Runs monthly on the last ${capitalize(lastDayMatch[1])} at ${time}`,
    };
  }

  const numericMatch = dayPart.match(/^(\d+)(?:st|nd|rd|th)?$/);
  if (!numericMatch || !numericMatch[1]) return null;

  const dayNum = Number.parseInt(numericMatch[1], 10);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return null;

  return {
    success: true,
    config: { type: "monthly", day: dayNum, time },
    preview: `Runs monthly on day ${dayNum} at ${time}`,
  };
}

function parseOnceAt(input: string): ScheduleParseSuccess | null {
  const match = input.match(/^once\s+at\s+(.+)$/i);
  if (!match || !match[1]) return null;

  const at = parseOnceDateTime(match[1]);
  if (!at) return null;

  return {
    success: true,
    config: { type: "once", at },
    preview: `Runs once at ${at}`,
  };
}

function parseTime(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "midnight") return "00:00";
  if (trimmed === "noon") return "12:00";

  const time24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match && time24Match[1] && time24Match[2]) {
    const hours = Number.parseInt(time24Match[1], 10);
    const minutes = Number.parseInt(time24Match[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }

  const time12Match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (time12Match && time12Match[1] && time12Match[3]) {
    let hours = Number.parseInt(time12Match[1], 10);
    const minutes = time12Match[2] ? Number.parseInt(time12Match[2], 10) : 0;
    const period = time12Match[3];

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }

    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  return null;
}

function parseOnceDateTime(input: string): string | null {
  const trimmed = input.trim();

  const naiveMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/);
  if (naiveMatch && naiveMatch[1] && naiveMatch[2]) {
    const iso = `${naiveMatch[1]}T${naiveMatch[2]}:00.000Z`;
    return isValidDateTime(iso) ? iso : null;
  }

  const timezoneAwareMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/i
  );
  if (!timezoneAwareMatch || !timezoneAwareMatch[1] || !timezoneAwareMatch[2] || !timezoneAwareMatch[4]) {
    return null;
  }

  const seconds = timezoneAwareMatch[3] ?? "00";
  const normalized = `${timezoneAwareMatch[1]}T${timezoneAwareMatch[2]}:${seconds}${timezoneAwareMatch[4].toUpperCase()}`;
  if (!isValidDateTime(normalized)) {
    return null;
  }

  return new Date(normalized).toISOString();
}

function isValidDateTime(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function unsupportedSchedule(input: string): ScheduleParseFailure {
  return {
    success: false,
    code: "UNSUPPORTED_SCHEDULE",
    error: unsupportedMessage(`Unsupported schedule string: \"${input}\".`),
    examples: SUPPORTED_SCHEDULE_EXAMPLES,
  };
}

function unsupportedMessage(prefix: string): string {
  return `${prefix} Supported examples: ${SUPPORTED_SCHEDULE_EXAMPLES.join("; ")}.`;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatSchedulePreview(config: ScheduleConfig): string {
  switch (config.type) {
    case "every":
      return `Runs every ${config.interval}`;
    case "daily":
      return `Runs daily at ${config.times.join(", ")}`;
    case "weekly": {
      const days = [...config.days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
      return `Runs ${days.join(", ")} at ${config.time}`;
    }
    case "monthly":
      return `Runs monthly on ${config.day} at ${config.time}`;
    case "once":
      return `Runs once at ${config.at}`;
    case "cron":
      return `Cron: ${config.expression}`;
  }
}
