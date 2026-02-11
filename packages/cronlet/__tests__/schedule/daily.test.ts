import { describe, it, expect } from "vitest";
import { daily } from "../../src/schedule/daily.js";

describe("daily()", () => {
  describe("single time", () => {
    it("parses morning time", () => {
      const result = daily("09:00");
      expect(result.type).toBe("daily");
      expect(result.cron).toBe("0 9 * * *");
      expect(result.humanReadable).toBe("daily at 9:00 AM");
    });

    it("parses afternoon time", () => {
      const result = daily("17:30");
      expect(result.type).toBe("daily");
      expect(result.cron).toBe("30 17 * * *");
      expect(result.humanReadable).toBe("daily at 5:30 PM");
    });

    it("parses midnight", () => {
      const result = daily("00:00");
      expect(result.cron).toBe("0 0 * * *");
      expect(result.humanReadable).toBe("daily at 12:00 AM");
    });

    it("parses noon", () => {
      const result = daily("12:00");
      expect(result.cron).toBe("0 12 * * *");
      expect(result.humanReadable).toBe("daily at 12:00 PM");
    });
  });

  describe("multiple times", () => {
    it("parses two times with same minute", () => {
      const result = daily("09:00", "17:00");
      expect(result.cron).toBe("0 9,17 * * *");
      expect(result.humanReadable).toBe("daily at 9:00 AM and 5:00 PM");
    });

    it("parses two times with same hour", () => {
      const result = daily("09:00", "09:30");
      expect(result.cron).toBe("0,30 9 * * *");
      expect(result.humanReadable).toBe("daily at 9:00 AM and 9:30 AM");
    });

    it("handles three times with same minute", () => {
      const result = daily("08:00", "12:00", "18:00");
      expect(result.cron).toBe("0 8,12,18 * * *");
      expect(result.humanReadable).toBe("daily at 8:00 AM, 12:00 PM, and 6:00 PM");
    });

    it("throws for times with different hours AND minutes", () => {
      expect(() => daily("09:30", "17:45")).toThrow(
        "daily() with multiple times requires either the same hour or same minute"
      );
    });
  });

  describe("timezone", () => {
    it("supports timezone chaining", () => {
      const result = daily("09:00").withTimezone("America/Los_Angeles");
      expect(result.timezone).toBe("America/Los_Angeles");
    });
  });

  describe("invalid times", () => {
    it("throws on invalid format", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => daily("9am")).toThrow("Invalid time format");
    });

    it("throws on invalid hour", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => daily("25:00")).toThrow("Invalid time format");
    });

    it("throws on invalid minute", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => daily("09:60")).toThrow("Invalid time format");
    });
  });

  describe("stores original params", () => {
    it("stores single time", () => {
      const result = daily("09:00");
      expect(result.originalParams).toEqual({ times: ["09:00"] });
    });

    it("stores multiple times", () => {
      const result = daily("09:00", "17:00");
      expect(result.originalParams).toEqual({ times: ["09:00", "17:00"] });
    });
  });
});
