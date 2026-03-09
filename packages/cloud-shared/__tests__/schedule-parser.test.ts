import { describe, expect, it } from "vitest";
import {
  parseSchedule,
  resolveSchedule,
  SUPPORTED_SCHEDULE_EXAMPLES,
} from "../src/schedule-parser";

describe("schedule parser", () => {
  it("parses supported interval strings", () => {
    const result = parseSchedule("every 15 minutes");
    expect(result).toEqual({
      success: true,
      config: { type: "every", interval: "15m" },
      preview: "Runs every 15 minutes",
    });
  });

  it("parses daily strings deterministically", () => {
    const result = parseSchedule("daily at 9am");
    expect(result).toEqual({
      success: true,
      config: { type: "daily", times: ["09:00"] },
      preview: "Runs daily at 09:00",
    });
  });

  it("parses weekday strings", () => {
    const result = parseSchedule("weekdays at 5pm");
    expect(result).toEqual({
      success: true,
      config: { type: "weekly", days: ["mon", "tue", "wed", "thu", "fri"], time: "17:00" },
      preview: "Runs weekdays at 17:00",
    });
  });

  it("parses weekly day strings", () => {
    const result = parseSchedule("every friday at 9am");
    expect(result).toEqual({
      success: true,
      config: { type: "weekly", days: ["fri"], time: "09:00" },
      preview: "Runs every Friday at 09:00",
    });
  });

  it("parses monthly last weekday strings", () => {
    const result = parseSchedule("monthly on the last friday at 9am");
    expect(result).toEqual({
      success: true,
      config: { type: "monthly", day: "last-fri", time: "09:00" },
      preview: "Runs monthly on the last Friday at 09:00",
    });
  });

  it("parses naive once strings as UTC", () => {
    const result = parseSchedule("once at 2026-03-15 09:00");
    expect(result).toEqual({
      success: true,
      config: { type: "once", at: "2026-03-15T09:00:00.000Z" },
      preview: "Runs once at 2026-03-15T09:00:00.000Z",
    });
  });

  it("preserves absolute time for once strings with timezone offsets", () => {
    const result = parseSchedule("once at 2026-03-15 09:00+02:00");
    expect(result).toEqual({
      success: true,
      config: { type: "once", at: "2026-03-15T07:00:00.000Z" },
      preview: "Runs once at 2026-03-15T07:00:00.000Z",
    });
  });

  it("validates schedule objects via resolveSchedule", () => {
    const result = resolveSchedule({ type: "daily", times: ["09:00"] });
    expect(result).toEqual({
      success: true,
      config: { type: "daily", times: ["09:00"] },
      preview: "Runs daily at 09:00",
    });
  });

  it("rejects unsupported phrasing with stable examples", () => {
    const result = parseSchedule("every other friday");
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected parse failure");
    }
    expect(result.code).toBe("UNSUPPORTED_SCHEDULE");
    expect(result.error).toContain('Unsupported schedule string: "every other friday".');
    expect(result.examples).toEqual(SUPPORTED_SCHEDULE_EXAMPLES);
  });

  it("rejects unsupported input types via resolveSchedule", () => {
    const result = resolveSchedule(42);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected parse failure");
    }
    expect(result.code).toBe("INVALID_SCHEDULE_INPUT");
    expect(result.examples).toEqual(SUPPORTED_SCHEDULE_EXAMPLES);
  });
});
