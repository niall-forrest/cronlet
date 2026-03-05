import type { ScheduleConfig } from "@cronlet/shared";

interface ParseResult {
  success: boolean;
  config?: ScheduleConfig;
  preview?: string;
  error?: string;
}

type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

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
const WEEKENDS: DayOfWeek[] = ["sat", "sun"];
const ALL_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Parse natural language schedule descriptions into ScheduleConfig.
 *
 * Supported formats:
 * - "every 5 minutes", "every 1 hour", "every 30 seconds"
 * - "daily at 9am", "daily at 14:30"
 * - "every day at 9:00"
 * - "weekdays at 9am", "weekends at 10:00"
 * - "every monday at 9am", "mon, wed, fri at 9:00"
 * - "weekly on monday at 9am"
 * - "monthly on the 1st at 9am", "monthly on the last friday at 9am"
 */
export function parseSchedule(description: string): ParseResult {
  const input = description.toLowerCase().trim();

  // Try each parser in order
  const parsers = [
    parseEveryInterval,
    parseDailyAt,
    parseWeekdaysWeekends,
    parseWeeklyOn,
    parseMonthlyOn,
    parseSpecificDays,
  ];

  for (const parser of parsers) {
    const result = parser(input);
    if (result.success) {
      return result;
    }
  }

  return {
    success: false,
    error: `Could not parse schedule: "${description}". Try formats like "every 15 minutes", "daily at 9am", or "weekdays at 9:00".`,
  };
}

function parseEveryInterval(input: string): ParseResult {
  // "every 5 minutes", "every 1 hour", "every 30 seconds"
  const match = input.match(/^every\s+(\d+)\s*(seconds?|minutes?|hours?|days?)$/i);
  if (!match || !match[1] || !match[2]) return { success: false };

  const amount = parseInt(match[1], 10);
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
    return { success: false };
  }

  return {
    success: true,
    config: { type: "every", interval },
    preview: `Runs every ${amount} ${unitLabel}`,
  };
}

function parseDailyAt(input: string): ParseResult {
  // "daily at 9am", "every day at 14:30"
  const match = input.match(/^(?:daily|every\s+day)\s+at\s+(.+)$/i);
  if (!match || !match[1]) return { success: false };

  const time = parseTime(match[1]);
  if (!time) {
    return { success: false, error: `Invalid time: ${match[1]}` };
  }

  return {
    success: true,
    config: { type: "daily", times: [time] },
    preview: `Runs daily at ${time}`,
  };
}

function parseWeekdaysWeekends(input: string): ParseResult {
  // "weekdays at 9am", "weekends at 10:00"
  const weekdaysMatch = input.match(/^weekdays?\s+at\s+(.+)$/i);
  if (weekdaysMatch && weekdaysMatch[1]) {
    const time = parseTime(weekdaysMatch[1]);
    if (!time) return { success: false };

    return {
      success: true,
      config: { type: "weekly", days: WEEKDAYS, time },
      preview: `Runs weekdays at ${time}`,
    };
  }

  const weekendsMatch = input.match(/^weekends?\s+at\s+(.+)$/i);
  if (weekendsMatch && weekendsMatch[1]) {
    const time = parseTime(weekendsMatch[1]);
    if (!time) return { success: false };

    return {
      success: true,
      config: { type: "weekly", days: WEEKENDS, time },
      preview: `Runs weekends at ${time}`,
    };
  }

  return { success: false };
}

function parseWeeklyOn(input: string): ParseResult {
  // "weekly on monday at 9am", "every monday at 9am"
  const match = input.match(/^(?:weekly\s+on|every)\s+(\w+)\s+at\s+(.+)$/i);
  if (!match || !match[1] || !match[2]) return { success: false };

  const dayName = match[1].toLowerCase();
  const day = DAY_MAP[dayName];
  if (!day) return { success: false };

  const time = parseTime(match[2]);
  if (!time) return { success: false };

  return {
    success: true,
    config: { type: "weekly", days: [day], time },
    preview: `Runs every ${capitalize(dayName)} at ${time}`,
  };
}

function parseSpecificDays(input: string): ParseResult {
  // "mon, wed, fri at 9:00", "monday and friday at 9am"
  const match = input.match(/^(.+?)\s+at\s+(.+)$/i);
  if (!match || !match[1] || !match[2]) return { success: false };

  const daysPart = match[1];
  const time = parseTime(match[2]);
  if (!time) return { success: false };

  // Parse days
  const dayTokens = daysPart.split(/[,\s]+and\s+|[,\s]+/);
  const days: DayOfWeek[] = [];

  for (const token of dayTokens) {
    const day = DAY_MAP[token.trim().toLowerCase()];
    if (day && !days.includes(day)) {
      days.push(day);
    }
  }

  if (days.length === 0) return { success: false };

  // Sort days in week order
  days.sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b));

  const dayNames = days.map(d => capitalize(d)).join(", ");

  return {
    success: true,
    config: { type: "weekly", days, time },
    preview: `Runs ${dayNames} at ${time}`,
  };
}

function parseMonthlyOn(input: string): ParseResult {
  // "monthly on the 1st at 9am", "monthly on the last friday at 9am"
  const match = input.match(/^monthly\s+on\s+(?:the\s+)?(.+?)\s+at\s+(.+)$/i);
  if (!match || !match[1] || !match[2]) return { success: false };

  const dayPart = match[1].toLowerCase();
  const time = parseTime(match[2]);
  if (!time) return { success: false };

  // Check for "last" patterns
  if (dayPart === "last" || dayPart === "last day") {
    return {
      success: true,
      config: { type: "monthly", day: "last", time },
      preview: `Runs monthly on the last day at ${time}`,
    };
  }

  const lastDayMatch = dayPart.match(/^last\s+(\w+)$/);
  if (lastDayMatch && lastDayMatch[1]) {
    const dayName = lastDayMatch[1];
    const day = DAY_MAP[dayName];
    if (day) {
      const lastDay = `last-${day}` as "last-mon" | "last-tue" | "last-wed" | "last-thu" | "last-fri" | "last-sat" | "last-sun";
      return {
        success: true,
        config: { type: "monthly", day: lastDay, time },
        preview: `Runs monthly on the last ${capitalize(dayName)} at ${time}`,
      };
    }
  }

  // Check for numeric day (1st, 2nd, 15th, etc.)
  const numMatch = dayPart.match(/^(\d+)(?:st|nd|rd|th)?$/);
  if (numMatch && numMatch[1]) {
    const dayNum = parseInt(numMatch[1], 10);
    if (dayNum >= 1 && dayNum <= 31) {
      return {
        success: true,
        config: { type: "monthly", day: dayNum, time },
        preview: `Runs monthly on day ${dayNum} at ${time}`,
      };
    }
  }

  return { success: false };
}

function parseTime(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  // 24-hour format: "14:30", "09:00"
  const time24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match && time24Match[1] && time24Match[2]) {
    const hours = parseInt(time24Match[1], 10);
    const minutes = parseInt(time24Match[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    }
  }

  // 12-hour format: "9am", "9:30pm", "9 am", "9:30 pm"
  const time12Match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (time12Match && time12Match[1] && time12Match[3]) {
    let hours = parseInt(time12Match[1], 10);
    const minutes = time12Match[2] ? parseInt(time12Match[2], 10) : 0;
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

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if a value is already a valid ScheduleConfig object.
 */
export function isScheduleConfig(value: unknown): value is ScheduleConfig {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const type = obj.type;

  if (type === "every") {
    return typeof obj.interval === "string";
  }
  if (type === "daily") {
    return Array.isArray(obj.times) && obj.times.every(t => typeof t === "string");
  }
  if (type === "weekly") {
    return Array.isArray(obj.days) && typeof obj.time === "string";
  }
  if (type === "monthly") {
    return (typeof obj.day === "number" || typeof obj.day === "string") && typeof obj.time === "string";
  }
  if (type === "once") {
    return typeof obj.at === "string";
  }
  if (type === "cron") {
    return typeof obj.expression === "string";
  }

  return false;
}

/**
 * Parse a schedule from either natural language or config object.
 */
export function resolveSchedule(input: unknown): ParseResult {
  // If it's already a config object, validate and return
  if (isScheduleConfig(input)) {
    return {
      success: true,
      config: input,
      preview: formatSchedulePreview(input),
    };
  }

  // If it's a string, try to parse it
  if (typeof input === "string") {
    return parseSchedule(input);
  }

  return {
    success: false,
    error: "Schedule must be a config object or natural language string",
  };
}

function formatSchedulePreview(config: ScheduleConfig): string {
  switch (config.type) {
    case "every":
      return `Runs every ${config.interval}`;
    case "daily":
      return `Runs daily at ${config.times.join(", ")}`;
    case "weekly":
      return `Runs ${config.days.join(", ")} at ${config.time}`;
    case "monthly":
      return `Runs monthly on ${config.day} at ${config.time}`;
    case "once":
      return `Runs once at ${config.at}`;
    case "cron":
      return `Cron: ${config.expression}`;
  }
}
