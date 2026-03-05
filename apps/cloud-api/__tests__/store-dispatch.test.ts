import { describe, expect, it } from "vitest";
import { InMemoryCloudStore } from "../src/lib/store.js";

function setupStore(orgId: string) {
  const store = new InMemoryCloudStore();

  const task = store.createTask(orgId, {
    name: "Test Task",
    handler: {
      type: "webhook",
      url: "https://example.com/cronlet",
    },
    schedule: {
      type: "daily",
      times: ["09:00"],
    },
    timezone: "UTC",
  });

  return { store, task };
}

describe("InMemoryCloudStore dispatch semantics", () => {
  it("claims a due task once and keeps subsequent claims deduped", () => {
    const { store, task } = setupStore("org_due");

    // Access internal tasks map to set nextRunAt in the past
    const tasks = (store as unknown as { tasks: Map<string, Record<string, unknown>> }).tasks;
    const current = tasks.get(task.id);
    if (!current) {
      throw new Error("task missing in test setup");
    }

    tasks.set(task.id, {
      ...current,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const firstClaim = store.claimDueDispatches(10);
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]?.taskId).toBe(task.id);

    const secondClaim = store.claimDueDispatches(10);
    expect(secondClaim).toHaveLength(0);

    const runs = store.listRuns("org_due");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("queued");
    expect(runs[0]?.trigger).toBe("schedule");
  });

  it("allows due dispatch during delinquent grace and blocks after grace expiry", () => {
    const { store, task } = setupStore("org_grace");

    const tasks = (store as unknown as { tasks: Map<string, Record<string, unknown>> }).tasks;
    const current = tasks.get(task.id);
    if (!current) {
      throw new Error("task missing in test setup");
    }

    store.upsertEntitlementForOrg("org_grace", {
      tier: "free",
      delinquent: true,
      graceEndsAt: new Date(Date.now() + 60_000).toISOString(),
    });

    tasks.set(task.id, {
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

    const refreshed = tasks.get(task.id);
    if (!refreshed) {
      throw new Error("task missing after first claim");
    }

    tasks.set(task.id, {
      ...refreshed,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const afterGrace = store.claimDueDispatches(10);
    expect(afterGrace).toHaveLength(0);
  });

  it("prevents stale updates from overriding terminal run status", () => {
    const { store, task } = setupStore("org_run_status");

    const run = store.triggerTask("org_run_status", task.id, "manual");

    store.updateRunStatus(run.id, { status: "running", attempt: 1 });
    store.updateRunStatus(run.id, { status: "queued", attempt: 1, durationMs: 150, errorMessage: "Retrying: network" });
    const success = store.updateRunStatus(run.id, { status: "success", attempt: 2, durationMs: 320 });

    expect(success.status).toBe("success");
    expect(success.attempt).toBe(2);
    expect(success.completedAt).toBeTypeOf("string");

    const stale = store.updateRunStatus(run.id, { status: "failure", attempt: 1, durationMs: 999, errorMessage: "stale failure" });
    expect(stale.status).toBe("success");
    expect(stale.attempt).toBe(2);
    expect(stale.durationMs).toBe(320);
    expect(stale.errorMessage).toBeNull();
  });
});
