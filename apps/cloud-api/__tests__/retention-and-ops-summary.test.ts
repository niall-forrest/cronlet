import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AuditEventRecord,
  DispatchEventRecord,
  RunAttemptRecord,
  RunEventRecord,
  RunRecord,
  TaskEventRecord,
  TaskRecord,
} from "@cronlet/shared";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_retention_ops";
const INTERNAL_TOKEN = "retention-internal-token";

interface InternalDispatchJobRecord {
  id: string;
  orgId: string;
  taskId: string;
  runId: string;
  status: "pending" | "leased" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled" | "dead_lettered";
  availableAt: string;
  leaseOwner: string | null;
  leasedUntil: string | null;
  attemptCount: number;
  maxAttempts: number;
  retryWindowEndsAt: string | null;
  lastError: string | null;
  destinationKey: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CircuitBreakerRecordLike {
  id: string;
  orgId: string;
  destinationKey: string;
  state: "closed" | "open" | "half_open";
  consecutiveFailures: number;
  openedAt: string | null;
  cooldownUntil: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  probeInFlight: boolean;
  createdAt: string;
  updatedAt: string;
}

function adminHeaders(): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": "admin_retention",
    "x-role": "admin",
  };
}

function internalHeaders(): Record<string, string> {
  return {
    "x-internal-token": INTERNAL_TOKEN,
    "x-org-id": ORG_ID,
  };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function assertMemoryStore(
  store: unknown,
): asserts store is {
  tasks: Map<string, TaskRecord & { kind: "scheduled" | "dispatch" }>;
  runs: Map<string, RunRecord>;
  runAttempts: Map<string, RunAttemptRecord>;
  dispatchJobs: Map<string, InternalDispatchJobRecord>;
  taskEvents: Map<string, TaskEventRecord>;
  runEvents: Map<string, RunEventRecord>;
  dispatchEvents: Map<string, DispatchEventRecord>;
  auditEvents: Map<string, AuditEventRecord>;
  circuitBreakers: Map<string, CircuitBreakerRecordLike>;
} {
  if (
    typeof store !== "object"
    || store === null
    || !("tasks" in store)
    || !("runs" in store)
    || !("dispatchJobs" in store)
  ) {
    throw new Error("Expected in-memory cloud store");
  }
}

describe("retention cleanup and ops summary", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    process.env.CLOUD_INTERNAL_TOKEN = INTERNAL_TOKEN;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLOUD_INTERNAL_TOKEN;
  });

  it("reports operational backlog and retention windows", async () => {
    const app = await buildServer();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: adminHeaders(),
        payload: {
          name: "Ops Summary Task",
          handler: { type: "webhook", url: "https://api.example.com/hook" },
          schedule: { type: "daily", times: ["09:00"] },
        },
      });
      expect(created.statusCode).toBe(201);

      const task = created.json().data as TaskRecord;
      const store: unknown = app.cloudStore;
      assertMemoryStore(store);

      const overdueTask = store.tasks.get(task.id);
      if (!overdueTask) {
        throw new Error("Expected stored task");
      }
      store.tasks.set(task.id, {
        ...overdueTask,
        nextRunAt: isoDaysAgo(1),
      });

      const baseRunTime = isoDaysAgo(1);
      const pendingRun: RunRecord = {
        id: "run_pending",
        orgId: ORG_ID,
        taskId: task.id,
        status: "queued",
        trigger: "schedule",
        attempt: 1,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        output: null,
        logs: null,
        errorMessage: null,
        createdAt: baseRunTime,
      };
      const deadLetterRun: RunRecord = {
        ...pendingRun,
        id: "run_dead",
        status: "dead_lettered",
      };
      store.runs.set(pendingRun.id, pendingRun);
      store.runs.set(deadLetterRun.id, deadLetterRun);

      const dispatchBase = {
        orgId: ORG_ID,
        taskId: task.id,
        attemptCount: 1,
        maxAttempts: 10,
        retryWindowEndsAt: null,
        lastError: null,
        destinationKey: "api.example.com",
        createdAt: baseRunTime,
        updatedAt: baseRunTime,
      };
      store.dispatchJobs.set("dispatch_pending", {
        id: "dispatch_pending",
        runId: pendingRun.id,
        status: "pending",
        availableAt: isoDaysAgo(2),
        leaseOwner: null,
        leasedUntil: null,
        ...dispatchBase,
      });
      store.dispatchJobs.set("dispatch_retry", {
        id: "dispatch_retry",
        runId: pendingRun.id,
        status: "retry_wait",
        availableAt: isoDaysAgo(3),
        leaseOwner: null,
        leasedUntil: null,
        ...dispatchBase,
      });
      store.dispatchJobs.set("dispatch_leased", {
        id: "dispatch_leased",
        runId: pendingRun.id,
        status: "leased",
        availableAt: baseRunTime,
        leaseOwner: "worker-1",
        leasedUntil: isoDaysAgo(-1),
        ...dispatchBase,
      });
      store.dispatchJobs.set("dispatch_running", {
        id: "dispatch_running",
        runId: pendingRun.id,
        status: "running",
        availableAt: baseRunTime,
        leaseOwner: "worker-2",
        leasedUntil: isoDaysAgo(-1),
        ...dispatchBase,
      });
      store.circuitBreakers.set(`${ORG_ID}:api.example.com`, {
        id: "breaker_1",
        orgId: ORG_ID,
        destinationKey: "api.example.com",
        state: "open",
        consecutiveFailures: 4,
        openedAt: baseRunTime,
        cooldownUntil: isoDaysAgo(-1),
        lastFailureAt: baseRunTime,
        lastFailureReason: "5xx burst",
        probeInFlight: false,
        createdAt: baseRunTime,
        updatedAt: baseRunTime,
      });

      const summary = await app.inject({
        method: "GET",
        url: "/v1/ops-summary",
        headers: adminHeaders(),
      });

      expect(summary.statusCode).toBe(200);
      expect(summary.json().data).toMatchObject({
        pendingDispatches: 1,
        retryWaitDispatches: 1,
        leasedDispatches: 1,
        runningDispatches: 1,
        deadLetterRuns: 1,
        overdueTasks: 1,
        openCircuitBreakers: 1,
        retentionDays: 7,
        verboseRetentionDays: 7,
        deadLetterRetentionDays: 180,
        auditRetentionDays: 365,
      });
      expect(summary.json().data.oldestPendingDispatchAt).toEqual(expect.any(String));
      expect(summary.json().data.oldestRetryWaitDispatchAt).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it("cleans up retained history and prunes old verbose data", async () => {
    const app = await buildServer();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: adminHeaders(),
        payload: {
          name: "Retention Once Task",
          handler: { type: "webhook", url: "https://api.example.com/hook" },
          schedule: { type: "once", at: new Date(Date.now() + 60_000).toISOString() },
        },
      });
      expect(created.statusCode).toBe(201);

      const task = created.json().data as TaskRecord;
      const store: unknown = app.cloudStore;
      assertMemoryStore(store);

      const oldTimestamp = isoDaysAgo(400);
      const storedTask = store.tasks.get(task.id);
      if (!storedTask) {
        throw new Error("Expected stored once task");
      }
      store.tasks.set(task.id, {
        ...storedTask,
        active: false,
        nextRunAt: null,
        updatedAt: oldTimestamp,
      });

      const runId = "run_old_terminal";
      const dispatchId = "dispatch_old_terminal";
      const attemptId = "attempt_old_terminal";
      store.runs.set(runId, {
        id: runId,
        orgId: ORG_ID,
        taskId: task.id,
        status: "success",
        trigger: "schedule",
        attempt: 1,
        scheduledAt: oldTimestamp,
        startedAt: oldTimestamp,
        completedAt: oldTimestamp,
        durationMs: 1200,
        output: { ok: true },
        logs: "old run logs",
        errorMessage: null,
        createdAt: oldTimestamp,
      });
      store.dispatchJobs.set(dispatchId, {
        id: dispatchId,
        orgId: ORG_ID,
        taskId: task.id,
        runId,
        status: "succeeded",
        availableAt: oldTimestamp,
        leaseOwner: null,
        leasedUntil: null,
        attemptCount: 1,
        maxAttempts: 10,
        retryWindowEndsAt: null,
        lastError: null,
        destinationKey: "api.example.com",
        createdAt: oldTimestamp,
        updatedAt: oldTimestamp,
      });
      store.runAttempts.set(attemptId, {
        id: attemptId,
        orgId: ORG_ID,
        runId,
        taskId: task.id,
        dispatchJobId: dispatchId,
        attemptNumber: 1,
        status: "success",
        startedAt: oldTimestamp,
        completedAt: oldTimestamp,
        durationMs: 900,
        httpStatus: 200,
        errorClass: null,
        errorMessage: null,
        responseBodyPreview: "old preview",
        responseBodyHash: "hash123",
        output: { ok: true },
        logs: "old attempt logs",
        createdAt: oldTimestamp,
      });
      store.taskEvents.set("task_event_old", {
        id: "task_event_old",
        orgId: ORG_ID,
        taskId: task.id,
        action: "task.completed",
        previousState: "active",
        nextState: "paused",
        reason: null,
        metadata: null,
        createdAt: oldTimestamp,
      });
      store.runEvents.set("run_event_old", {
        id: "run_event_old",
        orgId: ORG_ID,
        runId,
        action: "run.completed",
        previousState: "running",
        nextState: "success",
        reason: null,
        metadata: null,
        createdAt: oldTimestamp,
      });
      store.dispatchEvents.set("dispatch_event_old", {
        id: "dispatch_event_old",
        orgId: ORG_ID,
        dispatchJobId: dispatchId,
        action: "dispatch.succeeded",
        previousState: "running",
        nextState: "succeeded",
        reason: null,
        metadata: null,
        createdAt: oldTimestamp,
      });
      store.auditEvents.set("audit_old", {
        id: "audit_old",
        orgId: ORG_ID,
        actorType: "internal",
        actorId: "retention_job",
        action: "cleanup.old",
        targetType: "run",
        targetId: runId,
        payloadHash: null,
        metadata: null,
        createdAt: oldTimestamp,
      });

      const cleanup = await app.inject({
        method: "POST",
        url: "/internal/retention/cleanup?limit=10",
        headers: internalHeaders(),
      });

      expect(cleanup.statusCode).toBe(200);
      expect(cleanup.json().data).toMatchObject({
        organizationsScanned: 1,
        runsDeleted: 1,
        oneOffTasksDeleted: 1,
        runLogsCleared: 1,
        runAttemptLogsCleared: 1,
        auditEventsDeleted: 1,
      });

      expect(store.tasks.has(task.id)).toBe(false);
      expect(store.runs.has(runId)).toBe(false);
      expect(store.runAttempts.has(attemptId)).toBe(false);
      expect(store.dispatchJobs.has(dispatchId)).toBe(false);
      expect(store.auditEvents.has("audit_old")).toBe(false);
    } finally {
      await app.close();
    }
  });
});
