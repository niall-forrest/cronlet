import { daily, monthly, weekly, type JobConfig, type JobDefinition, type ScheduleBuilder } from "cronlet";
import { describe, expect, it } from "vitest";
import type { CloudLinkConfig } from "../../src/cloud/config.js";
import { toPlan } from "../../src/commands/cloud.js";

const link: CloudLinkConfig = {
  orgId: "org_test",
  projectId: "proj_test",
  environment: "prod",
  endpointUrl: "https://example.com/cron",
  linkedAt: "2026-01-01T00:00:00.000Z",
};

function buildJob(id: string, schedule: ScheduleBuilder, config: JobConfig = {}): JobDefinition {
  return {
    id,
    name: id,
    schedule,
    config,
    handler: async () => {},
  };
}

describe("cloud push parity conformance", () => {
  it("maps OSS schedule builders to cloud schedule descriptors", () => {
    const localJobs = [
      buildJob("jobs/daily-report", daily("09:00").withTimezone("America/New_York")),
      buildJob("jobs/weekly-digest", weekly(["mon", "fri"], "17:30")),
      buildJob("jobs/month-end", monthly("last-fri", "18:00")),
    ];

    const plan = toPlan(localJobs, [], [], undefined, link);
    const byKey = new Map(plan.createSchedules.map((op) => [op.jobKey, op.payload]));

    expect(byKey.get("jobs/daily-report")).toEqual({
      cron: "0 9 * * *",
      timezone: "America/New_York",
      active: true,
    });
    expect(byKey.get("jobs/weekly-digest")).toEqual({
      cron: "30 17 * * 1,5",
      timezone: "UTC",
      active: true,
    });
    expect(byKey.get("jobs/month-end")).toEqual({
      cron: "0 18 * * 5L",
      timezone: "UTC",
      active: true,
    });
  });

  it("preserves runtime defaults and explicit overrides", () => {
    const localJobs = [
      buildJob("jobs/defaults", daily("09:00")),
      buildJob("jobs/custom", daily("10:00"), {
        concurrency: "queue",
        catchup: true,
        retry: {
          attempts: 4,
          backoff: "exponential",
          initialDelay: "10s",
        },
        timeout: "5m",
      }),
    ];

    const plan = toPlan(localJobs, [], [], undefined, link);
    const byKey = new Map(plan.createJobs.map((op) => [op.key, op.payload]));

    expect(byKey.get("jobs/defaults")).toMatchObject({
      key: "jobs/defaults",
      name: "jobs/defaults",
      concurrency: "skip",
      catchup: false,
      retryAttempts: 1,
      retryBackoff: "linear",
      retryInitialDelay: "1s",
      timeout: "30s",
    });

    expect(byKey.get("jobs/custom")).toMatchObject({
      key: "jobs/custom",
      name: "jobs/custom",
      concurrency: "queue",
      catchup: true,
      retryAttempts: 4,
      retryBackoff: "exponential",
      retryInitialDelay: "10s",
      timeout: "5m",
    });
  });

  it("preserves local job identity in migration payloads", () => {
    const localJobs = [buildJob("billing/sync-stripe", daily("08:00"))];
    const plan = toPlan(localJobs, [], [], undefined, link);

    expect(plan.createJobs[0]?.key).toBe("billing/sync-stripe");
    expect(plan.createSchedules[0]?.jobKey).toBe("billing/sync-stripe");
  });
});
