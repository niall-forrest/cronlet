import { describe, expect, it } from "vitest";
import type { EndpointRecord, JobRecord, ScheduleRecord } from "@cronlet/cloud-shared";
import type { JobDefinition } from "cronlet";
import type { CloudLinkConfig } from "../../src/cloud/config.js";
import { toPlan } from "../../src/commands/cloud.js";

function createJob(id: string, overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    id,
    name: id,
    schedule: {
      type: "interval",
      cron: "*/5 * * * *",
      humanReadable: "every 5 minutes",
      originalParams: {},
      timezone: "UTC",
      ...overrides.schedule,
    },
    config: {
      concurrency: "skip",
      catchup: false,
      retry: {
        attempts: 1,
        backoff: "linear",
        initialDelay: "1s",
      },
      timeout: "30s",
      ...overrides.config,
    },
    handler: async () => {},
    ...overrides,
  };
}

function remoteJob(
  key: string,
  overrides: Partial<JobRecord> = {}
): JobRecord {
  return {
    id: `job_${key}`,
    orgId: "org_test",
    projectId: "proj_test",
    environment: "prod",
    endpointId: "endpoint_1",
    name: key,
    key,
    concurrency: "skip",
    catchup: false,
    retryAttempts: 1,
    retryBackoff: "linear",
    retryInitialDelay: "1s",
    timeout: "30s",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function remoteSchedule(
  scheduleId: string,
  jobId: string,
  overrides: Partial<ScheduleRecord> = {}
): ScheduleRecord {
  return {
    id: scheduleId,
    orgId: "org_test",
    projectId: "proj_test",
    jobId,
    cron: "*/5 * * * *",
    timezone: "UTC",
    active: true,
    nextRunAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const link: CloudLinkConfig = {
  orgId: "org_test",
  projectId: "proj_test",
  environment: "prod",
  endpointUrl: "https://example.com/cron",
  linkedAt: "2026-01-01T00:00:00.000Z",
};

const endpoint: EndpointRecord = {
  id: "endpoint_1",
  orgId: "org_test",
  projectId: "proj_test",
  environment: "prod",
  name: "default-prod",
  url: "https://example.com/cron",
  authMode: "none",
  authSecretRef: null,
  timeoutMs: 30000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("cloud push plan", () => {
  it("is deterministic and sorted for create operations", () => {
    const localJobs = [createJob("z-job"), createJob("a-job"), createJob("m-job")];

    const plan = toPlan(localJobs, [], [], undefined, link);

    expect(plan.endpoint.mode).toBe("create");
    expect(plan.createJobs.map((job) => job.key)).toEqual(["a-job", "m-job", "z-job"]);
    expect(plan.createSchedules.map((schedule) => schedule.jobKey)).toEqual(["a-job", "m-job", "z-job"]);
  });

  it("is idempotent when remote endpoint, jobs and schedules already match", () => {
    const localJobs = [createJob("a-job"), createJob("b-job")];
    const remoteJobs = [remoteJob("a-job"), remoteJob("b-job")];
    const remoteSchedules = [
      remoteSchedule("sched_a", "job_a-job"),
      remoteSchedule("sched_b", "job_b-job"),
    ];

    const plan = toPlan(localJobs, remoteJobs, remoteSchedules, endpoint, link);

    expect(plan.endpoint.mode).toBe("none");
    expect(plan.createJobs).toHaveLength(0);
    expect(plan.updateJobs).toHaveLength(0);
    expect(plan.pauseJobs).toHaveLength(0);
    expect(plan.createSchedules).toHaveLength(0);
    expect(plan.updateSchedules).toHaveLength(0);
    expect(plan.pauseSchedules).toHaveLength(0);
  });

  it("detects update/pause drift and keeps operations deterministic", () => {
    const localJobs = [createJob("a-job", { config: { concurrency: "queue" } })];

    const remoteA = remoteJob("a-job", {
      name: "Old Name",
      concurrency: "skip",
      active: false,
    });
    const remoteB = remoteJob("b-job", { active: true });

    const remoteSchedules = [
      remoteSchedule("sched_a_0", remoteA.id, {
        cron: "0 * * * *",
        timezone: "Europe/London",
        active: true,
      }),
      remoteSchedule("sched_a_z", remoteA.id, {
        active: true,
      }),
      remoteSchedule("sched_b", remoteB.id, {
        active: true,
      }),
    ];

    const plan = toPlan(localJobs, [remoteB, remoteA], remoteSchedules, endpoint, link);

    expect(plan.updateJobs.map((job) => job.key)).toEqual(["a-job"]);
    expect(plan.updateJobs[0]?.changes).toEqual(
      expect.arrayContaining(["name", "concurrency", "active"])
    );
    expect(plan.pauseJobs.map((job) => job.key)).toEqual(["b-job"]);

    expect(plan.updateSchedules.map((schedule) => schedule.jobKey)).toEqual(["a-job"]);
    expect(plan.updateSchedules[0]?.changes).toEqual(
      expect.arrayContaining(["cron", "timezone"])
    );

    expect(plan.pauseSchedules.map((schedule) => `${schedule.jobKey}:${schedule.scheduleId}`)).toEqual([
      "a-job:sched_a_z",
      "b-job:sched_b",
    ]);
  });

  it("detects endpoint drift and emits update operation", () => {
    const localJobs: JobDefinition[] = [];
    const driftedEndpoint: EndpointRecord = {
      ...endpoint,
      url: "https://old.example.com/cron",
      timeoutMs: 15000,
      authMode: "bearer",
    };

    const plan = toPlan(localJobs, [], [], driftedEndpoint, link);

    expect(plan.endpoint.mode).toBe("update");
    expect(plan.endpoint.patch?.changes).toEqual(
      expect.arrayContaining(["url", "authMode", "timeoutMs"])
    );
  });
});
