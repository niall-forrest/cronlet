import { describe, it, expect } from "vitest";
import { monthly } from "../../src/schedule/monthly.js";

describe("monthly()", () => {
  describe("specific day of month", () => {
    it("parses 1st of month", () => {
      const result = monthly(1, "09:00");
      expect(result.type).toBe("monthly");
      expect(result.cron).toBe("0 9 1 * *");
      expect(result.humanReadable).toBe("1st of every month at 9:00 AM");
    });

    it("parses 15th of month", () => {
      const result = monthly(15, "12:00");
      expect(result.cron).toBe("0 12 15 * *");
      expect(result.humanReadable).toBe("15th of every month at 12:00 PM");
    });

    it("parses 2nd of month (ordinal)", () => {
      const result = monthly(2, "09:00");
      expect(result.humanReadable).toBe("2nd of every month at 9:00 AM");
    });

    it("parses 3rd of month (ordinal)", () => {
      const result = monthly(3, "09:00");
      expect(result.humanReadable).toBe("3rd of every month at 9:00 AM");
    });

    it("parses 31st of month", () => {
      const result = monthly(31, "09:00");
      expect(result.cron).toBe("0 9 31 * *");
      expect(result.humanReadable).toBe("31st of every month at 9:00 AM");
    });
  });

  describe("last weekday of month", () => {
    it("parses last friday", () => {
      const result = monthly("last-fri", "17:00");
      expect(result.type).toBe("monthly");
      expect(result.cron).toBe("0 17 * * 5L");
      expect(result.humanReadable).toBe("last Friday of every month at 5:00 PM");
    });

    it("parses last monday", () => {
      const result = monthly("last-mon", "09:00");
      expect(result.cron).toBe("0 9 * * 1L");
      expect(result.humanReadable).toBe("last Monday of every month at 9:00 AM");
    });

    it("parses last sunday", () => {
      const result = monthly("last-sun", "10:00");
      expect(result.cron).toBe("0 10 * * 0L");
      expect(result.humanReadable).toBe("last Sunday of every month at 10:00 AM");
    });
  });

  describe("timezone", () => {
    it("supports timezone chaining", () => {
      const result = monthly(1, "09:00").withTimezone("Europe/Paris");
      expect(result.timezone).toBe("Europe/Paris");
    });
  });

  describe("invalid inputs", () => {
    it("throws on day 0", () => {
      expect(() => monthly(0, "09:00")).toThrow("Invalid day of month");
    });

    it("throws on day 32", () => {
      expect(() => monthly(32, "09:00")).toThrow("Invalid day of month");
    });

    it("throws on negative day", () => {
      expect(() => monthly(-1, "09:00")).toThrow("Invalid day of month");
    });

    it("throws on invalid last-day format", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => monthly("last-friday", "09:00")).toThrow("Invalid monthly day format");
    });

    it("throws on invalid time", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => monthly(1, "invalid")).toThrow("Invalid time format");
    });
  });

  describe("stores original params", () => {
    it("stores numeric day", () => {
      const result = monthly(15, "09:00");
      expect(result.originalParams).toEqual({ day: 15, time: "09:00" });
    });

    it("stores last-day format", () => {
      const result = monthly("last-fri", "17:00");
      expect(result.originalParams).toEqual({ day: "last-fri", time: "17:00" });
    });
  });
});
