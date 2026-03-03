import { describe, expect, it } from "vitest";
import type { JobDefinition } from "cronlet";
import { toPlan } from "../../src/commands/cloud.js";

function createJob(id: string): JobDefinition {
  return {
    id,
    name: id,
    schedule: {
      type: "interval",
      cron: "*/5 * * * *",
      humanReadable: "every 5 minutes",
      originalParams: {},
    },
    config: {},
    handler: async () => {},
  };
}

describe("cloud push plan", () => {
  it("is deterministic and sorted for dry-run output", () => {
    const localJobs = [createJob("z-job"), createJob("a-job"), createJob("m-job")];

    const plan = toPlan(localJobs, new Set<string>(), new Set<string>(), false);

    expect(plan.createJobs.map((job) => job.id)).toEqual(["a-job", "m-job", "z-job"]);
    expect(plan.createSchedules.map((job) => job.id)).toEqual(["a-job", "m-job", "z-job"]);
  });

  it("is idempotent when remote jobs and schedules already exist", () => {
    const localJobs = [createJob("a-job"), createJob("b-job")];
    const remoteJobKeys = new Set(["a-job", "b-job"]);
    const scheduledJobKeys = new Set(["a-job", "b-job"]);

    const plan = toPlan(localJobs, remoteJobKeys, scheduledJobKeys, true);

    expect(plan.createEndpoint).toBe(false);
    expect(plan.createJobs).toHaveLength(0);
    expect(plan.createSchedules).toHaveLength(0);
  });

  it("creates schedule only for jobs missing a remote schedule", () => {
    const localJobs = [createJob("a-job"), createJob("b-job"), createJob("c-job")];
    const remoteJobKeys = new Set(["a-job", "b-job", "c-job"]);
    const scheduledJobKeys = new Set(["a-job", "c-job"]);

    const plan = toPlan(localJobs, remoteJobKeys, scheduledJobKeys, true);

    expect(plan.createJobs).toHaveLength(0);
    expect(plan.createSchedules.map((job) => job.id)).toEqual(["b-job"]);
  });
});
