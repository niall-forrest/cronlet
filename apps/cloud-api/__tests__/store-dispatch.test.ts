import { describe, expect, it } from "vitest";
import { InMemoryCloudStore } from "../src/lib/store.js";

function setupStore(orgId: string) {
  const store = new InMemoryCloudStore();

  const project = store.createProject(orgId, {
    name: "Test Project",
    slug: `test-project-${orgId}`,
  });

  const endpoint = store.createEndpoint(orgId, {
    projectId: project.id,
    environment: "prod",
    name: "Primary",
    url: "https://example.com/cronlet",
    authMode: "none",
    timeoutMs: 30000,
  });

  const job = store.createJob(orgId, {
    projectId: project.id,
    environment: "prod",
    endpointId: endpoint.id,
    name: "Job",
    key: `job-${orgId}`,
    concurrency: "skip",
    catchup: false,
    retryAttempts: 2,
    retryBackoff: "linear",
    retryInitialDelay: "1s",
    timeout: "30s",
  });

  const schedule = store.createSchedule(orgId, {
    jobId: job.id,
    cron: "0 0 * * *",
    timezone: "UTC",
    active: true,
  });

  return { store, project, endpoint, job, schedule };
}

describe("InMemoryCloudStore dispatch semantics", () => {
  it("claims a due schedule once and keeps subsequent claims deduped", () => {
    const { store, schedule } = setupStore("org_due");

    const schedules = (store as unknown as { schedules: Map<string, Record<string, unknown>> }).schedules;
    const current = schedules.get(schedule.id);
    if (!current) {
      throw new Error("schedule missing in test setup");
    }

    schedules.set(schedule.id, {
      ...current,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const firstClaim = store.claimDueDispatches(10);
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.jobId).toBe(schedule.jobId);

    const secondClaim = store.claimDueDispatches(10);
    expect(secondClaim).toHaveLength(0);

    const runs = store.listRuns("org_due");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("queued");
    expect(runs[0]?.trigger).toBe("schedule");
    expect(runs[0]?.scheduleId).toBe(schedule.id);
  });

  it("allows due dispatch during delinquent grace and blocks after grace expiry", () => {
    const { store, schedule } = setupStore("org_grace");

    const schedules = (store as unknown as { schedules: Map<string, Record<string, unknown>> }).schedules;
    const current = schedules.get(schedule.id);
    if (!current) {
      throw new Error("schedule missing in test setup");
    }

    store.upsertEntitlementForOrg("org_grace", {
      tier: "free",
      delinquent: true,
      graceEndsAt: new Date(Date.now() + 60_000).toISOString(),
    });

    schedules.set(schedule.id, {
      ...current,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const duringGrace = store.claimDueDispatches(10);
    expect(duringGrace).toHaveLength(1);

    store.upsertEntitlementForOrg("org_grace", {
      tier: "free",
      delinquent: true,
      graceEndsAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const refreshed = schedules.get(schedule.id);
    if (!refreshed) {
      throw new Error("schedule missing after first claim");
    }

    schedules.set(schedule.id, {
      ...refreshed,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const afterGrace = store.claimDueDispatches(10);
    expect(afterGrace).toHaveLength(0);
  });

  it("prevents stale updates from overriding terminal run status", () => {
    const { store, job } = setupStore("org_run_status");

    const run = store.triggerJob("org_run_status", job.id, "manual", null);

    store.updateRunStatus(run.id, "running", 1);
    store.updateRunStatus(run.id, "queued", 1, 150, "Retrying: network");
    const success = store.updateRunStatus(run.id, "success", 2, 320);

    expect(success.status).toBe("success");
    expect(success.attempt).toBe(2);
    expect(success.completedAt).toBeTypeOf("string");

    const stale = store.updateRunStatus(run.id, "failure", 1, 999, "stale failure");
    expect(stale.status).toBe("success");
    expect(stale.attempt).toBe(2);
    expect(stale.durationMs).toBe(320);
    expect(stale.errorMessage).toBeNull();
  });
});
