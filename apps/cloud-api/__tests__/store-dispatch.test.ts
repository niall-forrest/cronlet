import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(runs[0]?.status).toBe("leased");
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

  it("increments runCount and pauses tasks that reach maxRuns", () => {
    const store = new InMemoryCloudStore();
    const task = store.createTask("org_lifecycle", {
      name: "Bounded Task",
      handler: {
        type: "webhook",
        url: "https://example.com/cronlet",
      },
      schedule: {
        type: "daily",
        times: ["09:00"],
      },
      timezone: "UTC",
      maxRuns: 1,
    });

    const run = store.triggerTask("org_lifecycle", task.id, "manual");
    store.updateRunStatus(run.id, { status: "success", attempt: 1, durationMs: 50 });

    const updatedTask = store.getTask("org_lifecycle", task.id);
    expect(updatedTask.runCount).toBe(1);
    expect(updatedTask.active).toBe(false);
    expect(updatedTask.nextRunAt).toBeNull();
  });

  it("opens destination circuit breakers after repeated retryable failures and half-opens with a single probe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const store = new InMemoryCloudStore();
    const task = store.createTask("org_breaker", {
      name: "Webhook Task",
      handler: {
        type: "webhook",
        url: "https://example.com/cronlet",
      },
      schedule: {
        type: "daily",
        times: ["09:00"],
      },
      timezone: "UTC",
      retryInitialDelay: "1s",
      retryMaxDelay: "1s",
      retryWindow: "1h",
      retryJitter: false,
    });

    store.triggerTask("org_breaker", task.id, "manual");
    store.triggerTask("org_breaker", task.id, "manual");

    const firstLease = store.claimDueDispatches(1);
    expect(firstLease).toHaveLength(1);
    store.completeDispatchAttempt({
      dispatchJobId: firstLease[0]!.dispatchJobId,
      attemptId: firstLease[0]!.attemptId,
      attemptNumber: firstLease[0]!.attemptNumber,
      status: "failure",
      durationMs: 100,
      errorMessage: "upstream 500",
    });

    vi.advanceTimersByTime(1000);
    const secondLease = store.claimDueDispatches(1);
    expect(secondLease).toHaveLength(1);
    store.completeDispatchAttempt({
      dispatchJobId: secondLease[0]!.dispatchJobId,
      attemptId: secondLease[0]!.attemptId,
      attemptNumber: secondLease[0]!.attemptNumber,
      status: "failure",
      durationMs: 100,
      errorMessage: "upstream 500",
    });

    vi.advanceTimersByTime(1000);
    const thirdLease = store.claimDueDispatches(1);
    expect(thirdLease).toHaveLength(1);
    store.completeDispatchAttempt({
      dispatchJobId: thirdLease[0]!.dispatchJobId,
      attemptId: thirdLease[0]!.attemptId,
      attemptNumber: thirdLease[0]!.attemptNumber,
      status: "failure",
      durationMs: 100,
      errorMessage: "upstream 500",
    });

    const breakers = store.listCircuitBreakers("org_breaker");
    expect(breakers).toHaveLength(1);
    expect(breakers[0]?.state).toBe("open");
    expect(breakers[0]?.probeInFlight).toBe(false);

    const dispatchJobs = (store as unknown as {
      dispatchJobs: Map<string, { destinationKey: string | null; status: string; availableAt: string }>;
    }).dispatchJobs;
    const siblingJob = Array.from(dispatchJobs.values()).find((job) => job.status === "pending" && job.destinationKey === "example.com");
    expect(siblingJob).toBeDefined();
    expect(new Date(siblingJob!.availableAt).getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);

    expect(store.claimDueDispatches(10)).toHaveLength(0);

    vi.advanceTimersByTime(5 * 60 * 1000);
    const probeLease = store.claimDueDispatches(1);
    expect(probeLease).toHaveLength(1);
    expect(store.claimDueDispatches(1)).toHaveLength(0);
    expect(store.listCircuitBreakers("org_breaker")[0]?.state).toBe("half_open");
    expect(store.listCircuitBreakers("org_breaker")[0]?.probeInFlight).toBe(true);

    store.completeDispatchAttempt({
      dispatchJobId: probeLease[0]!.dispatchJobId,
      attemptId: probeLease[0]!.attemptId,
      attemptNumber: probeLease[0]!.attemptNumber,
      status: "success",
      durationMs: 120,
    });

    expect(store.listCircuitBreakers("org_breaker")[0]?.state).toBe("closed");
    const siblingLease = store.claimDueDispatches(10);
    expect(siblingLease).toHaveLength(1);
  });
});
