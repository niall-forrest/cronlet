import { describe, it, expect } from "vitest";
import { every } from "../../src/schedule/every.js";

describe("every()", () => {
  describe("valid intervals", () => {
    it("parses seconds", () => {
      const result = every("30s");
      expect(result.type).toBe("interval");
      expect(result.cron).toBe("*/30 * * * * *");
      expect(result.humanReadable).toBe("every 30 seconds");
    });

    it("parses minutes", () => {
      const result = every("15m");
      expect(result.type).toBe("interval");
      expect(result.cron).toBe("*/15 * * * *");
      expect(result.humanReadable).toBe("every 15 minutes");
    });

    it("parses single minute", () => {
      const result = every("1m");
      expect(result.humanReadable).toBe("every 1 minute");
    });

    it("parses hours", () => {
      const result = every("2h");
      expect(result.type).toBe("interval");
      expect(result.cron).toBe("0 */2 * * *");
      expect(result.humanReadable).toBe("every 2 hours");
    });

    it("parses single hour", () => {
      const result = every("1h");
      expect(result.humanReadable).toBe("every 1 hour");
    });

    it("parses days", () => {
      const result = every("1d");
      expect(result.type).toBe("interval");
      expect(result.cron).toBe("0 0 * * *");
      expect(result.humanReadable).toBe("every 1 day");
    });

    it("parses multiple days", () => {
      const result = every("3d");
      expect(result.cron).toBe("0 0 */3 * *");
      expect(result.humanReadable).toBe("every 3 days");
    });

    it("parses weeks", () => {
      const result = every("1w");
      expect(result.type).toBe("interval");
      expect(result.cron).toBe("0 0 * * 0");
      expect(result.humanReadable).toBe("every 1 week");
    });

    it("parses multiple weeks", () => {
      const result = every("2w");
      expect(result.humanReadable).toBe("every 2 weeks");
    });
  });

  describe("timezone", () => {
    it("supports timezone chaining", () => {
      const result = every("1h").withTimezone("America/New_York");
      expect(result.timezone).toBe("America/New_York");
      expect(result.humanReadable).toBe("every 1 hour");
    });

    it("returns a new builder with timezone", () => {
      const original = every("1h");
      const withTz = original.withTimezone("Europe/London");
      expect(original.timezone).toBeUndefined();
      expect(withTz.timezone).toBe("Europe/London");
    });
  });

  describe("invalid intervals", () => {
    it("throws on invalid format", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => every("invalid")).toThrow("Invalid interval format");
    });

    it("throws on zero value", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => every("0m")).toThrow("Interval value must be positive");
    });

    it("throws on negative value", () => {
      // @ts-expect-error - Testing invalid input
      expect(() => every("-5m")).toThrow("Invalid interval format");
    });
  });

  describe("stores original params", () => {
    it("stores the interval string", () => {
      const result = every("15m");
      expect(result.originalParams).toEqual({ interval: "15m" });
    });
  });
});
