import { describe, it, expect } from "vitest";
import { cron } from "../../src/schedule/cron.js";

describe("cron()", () => {
  describe("valid expressions", () => {
    it("parses every minute", () => {
      const result = cron("* * * * *");
      expect(result.type).toBe("cron");
      expect(result.cron).toBe("* * * * *");
      expect(result.humanReadable).toBe("every minute");
    });

    it("parses every N minutes", () => {
      const result = cron("*/15 * * * *");
      expect(result.cron).toBe("*/15 * * * *");
      expect(result.humanReadable).toBe("every 15 minutes");
    });

    it("parses every hour", () => {
      const result = cron("0 * * * *");
      expect(result.humanReadable).toBe("every hour");
    });

    it("parses every N hours", () => {
      const result = cron("0 */2 * * *");
      expect(result.humanReadable).toBe("every 2 hours");
    });

    it("parses daily at specific time", () => {
      const result = cron("0 9 * * *");
      expect(result.humanReadable).toBe("daily at 9:00 AM");
    });

    it("parses complex expression", () => {
      const result = cron("0 9 * * 1-5");
      expect(result.cron).toBe("0 9 * * 1-5");
      // Falls back to showing the expression for complex patterns
      expect(result.humanReadable).toBe("cron: 0 9 * * 1-5");
    });

    it("parses 6-field cron (with seconds)", () => {
      const result = cron("*/30 * * * * *");
      expect(result.cron).toBe("*/30 * * * * *");
    });
  });

  describe("timezone", () => {
    it("supports timezone chaining", () => {
      const result = cron("0 9 * * *").withTimezone("UTC");
      expect(result.timezone).toBe("UTC");
    });
  });

  describe("invalid expressions", () => {
    it("throws on too few fields", () => {
      expect(() => cron("* * * *")).toThrow("Invalid cron expression");
    });

    it("throws on too many fields", () => {
      expect(() => cron("* * * * * * *")).toThrow("Invalid cron expression");
    });

    it("throws on invalid characters", () => {
      expect(() => cron("a b c d e")).toThrow("Invalid cron expression");
    });

    it("throws on empty string", () => {
      expect(() => cron("")).toThrow("Invalid cron expression");
    });
  });

  describe("stores original params", () => {
    it("stores the expression", () => {
      const result = cron("0 9 * * *");
      expect(result.originalParams).toEqual({ expression: "0 9 * * *" });
    });

    it("trims whitespace", () => {
      const result = cron("  0 9 * * *  ");
      expect(result.cron).toBe("0 9 * * *");
      expect(result.originalParams).toEqual({ expression: "0 9 * * *" });
    });
  });
});
