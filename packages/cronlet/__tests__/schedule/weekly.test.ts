import { describe, it, expect } from "vitest";
import { weekly } from "../../src/schedule/weekly.js";

describe("weekly()", () => {
  describe("single day", () => {
    it("parses friday", () => {
      const result = weekly("fri", "09:00");
      expect(result.type).toBe("weekly");
      expect(result.cron).toBe("0 9 * * 5");
      expect(result.humanReadable).toBe("every Friday at 9:00 AM");
    });

    it("parses monday", () => {
      const result = weekly("mon", "08:30");
      expect(result.cron).toBe("30 8 * * 1");
      expect(result.humanReadable).toBe("every Monday at 8:30 AM");
    });

    it("parses sunday", () => {
      const result = weekly("sun", "00:00");
      expect(result.cron).toBe("0 0 * * 0");
      expect(result.humanReadable).toBe("every Sunday at 12:00 AM");
    });
  });

  describe("multiple days", () => {
    it("parses two days", () => {
      const result = weekly(["mon", "fri"], "09:00");
      expect(result.cron).toBe("0 9 * * 1,5");
      expect(result.humanReadable).toBe("every Monday and Friday at 9:00 AM");
    });

    it("parses three days", () => {
      const result = weekly(["mon", "wed", "fri"], "09:00");
      expect(result.cron).toBe("0 9 * * 1,3,5");
      expect(result.humanReadable).toBe("every Monday, Wednesday, and Friday at 9:00 AM");
    });

    it("sorts days correctly", () => {
      const result = weekly(["fri", "mon", "wed"], "09:00");
      expect(result.cron).toBe("0 9 * * 1,3,5");
    });
  });

  describe("timezone", () => {
    it("supports timezone chaining", () => {
      const result = weekly("fri", "09:00").withTimezone("Asia/Tokyo");
      expect(result.timezone).toBe("Asia/Tokyo");
    });
  });

  describe("invalid inputs", () => {
    it("throws on invalid day", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => weekly("friday", "09:00")).toThrow("Invalid day of week");
    });

    it("throws on invalid time", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => weekly("fri", "invalid")).toThrow("Invalid time format");
    });
  });

  describe("stores original params", () => {
    it("stores single day as array", () => {
      const result = weekly("fri", "09:00");
      expect(result.originalParams).toEqual({ days: ["fri"], time: "09:00" });
    });

    it("stores multiple days", () => {
      const result = weekly(["mon", "fri"], "09:00");
      expect(result.originalParams).toEqual({ days: ["mon", "fri"], time: "09:00" });
    });
  });
});
