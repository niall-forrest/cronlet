import { describe, it, expect } from "vitest";
import type { JobDefinition } from "cronlet";
import { validateForVercel, flattenJobId } from "../../src/deploy/validation.js";

function createTestJob(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id: "test-job",
    name: "Test Job",
    schedule: {
      type: "daily",
      cron: "0 9 * * *",
      humanReadable: "daily at 9:00 AM",
      originalParams: {},
    },
    config: {},
    handler: async () => {},
    ...overrides,
  };
}

describe("validateForVercel", () => {
  it("accepts valid 5-field cron expression", () => {
    const job = createTestJob();

    const result = validateForVercel(job);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("rejects 6-field cron expression (has seconds)", () => {
    const job = createTestJob({
      schedule: {
        type: "interval",
        cron: "*/30 * * * * *",
        humanReadable: "every 30 seconds",
        originalParams: { interval: "30s" },
      },
    });

    const result = validateForVercel(job);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("seconds precision");
    expect(result.error).toContain("5-field");
  });

  it("rejects sub-minute intervals", () => {
    const job = createTestJob({
      schedule: {
        type: "interval",
        cron: "* * * * *",
        humanReadable: "every 30 seconds",
        originalParams: { interval: "30s" },
      },
    });

    const result = validateForVercel(job);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("30s interval");
    expect(result.error).toContain("minimum 1 minute");
  });

  it("warns about timezone usage", () => {
    const job = createTestJob({
      schedule: {
        type: "daily",
        cron: "0 9 * * *",
        humanReadable: "daily at 9:00 AM",
        originalParams: {},
        timezone: "America/New_York",
      },
    });

    const result = validateForVercel(job);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("timezone")
    );
  });

  it("warns when retry config could exceed function timeout", () => {
    const job = createTestJob({
      config: {
        timeout: "30s",
        retry: {
          attempts: 3,
          backoff: "exponential",
          initialDelay: "10s",
        },
      },
    });

    // 3 attempts * 30s timeout + backoff delays = ~90s+
    // Default function timeout is 60s
    const result = validateForVercel(job, 60000);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("retry config could take")
    );
  });

  it("warns about L suffix in cron expressions", () => {
    const job = createTestJob({
      schedule: {
        type: "monthly",
        cron: "0 17 * * 5L",
        humanReadable: "last Friday of month at 5:00 PM",
        originalParams: {},
      },
    });

    const result = validateForVercel(job);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.stringContaining('"L" suffix')
    );
  });
});

describe("flattenJobId", () => {
  it("returns simple ID unchanged", () => {
    expect(flattenJobId("weekly-digest")).toBe("weekly-digest");
  });

  it("replaces slashes with dashes", () => {
    expect(flattenJobId("billing/sync-stripe")).toBe("billing-sync-stripe");
  });

  it("handles multiple levels of nesting", () => {
    expect(flattenJobId("billing/invoices/generate")).toBe("billing-invoices-generate");
  });
});
