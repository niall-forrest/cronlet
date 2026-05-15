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
    const recoveredLease = store.claimDueDispatches(10);
    expect(recoveredLease).toHaveLength(1);

    const dispatchEvents = (store as unknown as {
      dispatchEvents: Map<string, { action: string }>;
    }).dispatchEvents;
    const actions = Array.from(dispatchEvents.values()).map((event) => event.action);
    expect(actions).toContain("dispatch.circuit_opened");
    expect(actions).toContain("dispatch.circuit_half_open");
    expect(actions).toContain("dispatch.circuit_closed");
  });

  it("round-robins leases across orgs instead of letting one org consume the whole batch", () => {
    const store = new InMemoryCloudStore();
    const firstOrgTaskA = store.createTask("org_alpha", {
      name: "Alpha A",
      handler: { type: "webhook", url: "https://alpha.example.com/a" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });
    const firstOrgTaskB = store.createTask("org_alpha", {
      name: "Alpha B",
      handler: { type: "webhook", url: "https://alpha.example.com/b" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });
    const secondOrgTask = store.createTask("org_beta", {
      name: "Beta A",
      handler: { type: "webhook", url: "https://beta.example.com/a" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });

    store.triggerTask("org_alpha", firstOrgTaskA.id, "manual");
    store.triggerTask("org_alpha", firstOrgTaskB.id, "manual");
    store.triggerTask("org_beta", secondOrgTask.id, "manual");

    const leases = store.claimDueDispatches(2);
    expect(leases).toHaveLength(2);
    expect(new Set(leases.map((lease) => lease.orgId))).toEqual(new Set(["org_alpha", "org_beta"]));
  });

  it("caps concurrent leases per destination within an org", () => {
    const store = new InMemoryCloudStore();
    const taskA = store.createTask("org_dest", {
      name: "Dest A",
      handler: { type: "webhook", url: "https://shared.example.com/a" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });
    const taskB = store.createTask("org_dest", {
      name: "Dest B",
      handler: { type: "webhook", url: "https://shared.example.com/b" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });
    const taskC = store.createTask("org_dest", {
      name: "Dest C",
      handler: { type: "webhook", url: "https://shared.example.com/c" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });

    store.triggerTask("org_dest", taskA.id, "manual");
    store.triggerTask("org_dest", taskB.id, "manual");
    store.triggerTask("org_dest", taskC.id, "manual");

    const firstLeases = store.claimDueDispatches(3);
    expect(firstLeases).toHaveLength(2);
    expect(firstLeases.every((lease) => lease.handlerType === "webhook")).toBe(true);

    const pendingShared = store.claimDueDispatches(3);
    expect(pendingShared).toHaveLength(0);

    store.completeDispatchAttempt({
      dispatchJobId: firstLeases[0]!.dispatchJobId,
      attemptId: firstLeases[0]!.attemptId,
      attemptNumber: firstLeases[0]!.attemptNumber,
      status: "success",
      durationMs: 50,
    });

    const afterRelease = store.claimDueDispatches(3);
    expect(afterRelease).toHaveLength(1);
  });

  it("records explicit dispatch events when outbound policy blocks delivery", () => {
    const store = new InMemoryCloudStore();
    const task = store.createTask("org_policy", {
      name: "Policy Blocked",
      handler: { type: "webhook", url: "https://blocked.example.com/hook" },
      schedule: { type: "daily", times: ["09:00"] },
      timezone: "UTC",
    });

    store.triggerTask("org_policy", task.id, "manual");
    const [lease] = store.claimDueDispatches(1);
    expect(lease).toBeDefined();

    store.completeDispatchAttempt({
      dispatchJobId: lease!.dispatchJobId,
      attemptId: lease!.attemptId,
      attemptNumber: lease!.attemptNumber,
      status: "terminal_client_error",
      durationMs: 25,
      errorClass: "OutboundTargetError",
      errorMessage: "Outbound target resolved to blocked address 127.0.0.1",
    });

    const events = store.listDispatchEvents("org_policy", lease!.dispatchJobId);
    expect(events.map((event) => event.action)).toContain("dispatch.policy_blocked");
    expect(events.find((event) => event.action === "dispatch.policy_blocked")?.reason).toBe("outbound_policy_blocked");
  });
});
