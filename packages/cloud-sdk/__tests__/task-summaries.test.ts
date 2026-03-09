import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunRecord, TaskRecord } from "@cronlet/shared";
import { CloudClient } from "../src/index";

function okResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ ok: true, data }),
  } as Response;
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task_1",
    orgId: "org_1",
    name: "Check API health",
    description: null,
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://example.com/health",
      method: "GET",
    },
    scheduleType: "every",
    scheduleConfig: {
      type: "every",
      interval: "5m",
    },
    timezone: "UTC",
    nextRunAt: "2026-03-09T10:05:00.000Z",
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1s",
    timeout: "30s",
    active: true,
    createdBy: null,
    callbackUrl: null,
    metadata: null,
    maxRuns: null,
    expiresAt: null,
    runCount: 0,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-09T09:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run_1",
    orgId: "org_1",
    taskId: "task_1",
    status: "success",
    trigger: "schedule",
    attempt: 1,
    scheduledAt: "2026-03-09T09:00:00.000Z",
    startedAt: "2026-03-09T09:00:01.000Z",
    completedAt: "2026-03-09T09:00:02.000Z",
    durationMs: 200,
    output: null,
    logs: null,
    errorMessage: null,
    createdAt: "2026-03-09T09:00:00.000Z",
    ...overrides,
  };
}

describe("task summaries", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns healthy for a mostly successful window with one transient timeout", async () => {
    const task = makeTask();
    const runs = [
      makeRun({ id: "run_success_latest", createdAt: "2026-03-09T09:58:00.000Z", durationMs: 210 }),
      makeRun({ id: "run_timeout", status: "timeout", durationMs: null, errorMessage: "timeout", createdAt: "2026-03-08T14:00:00.000Z" }),
      ...Array.from({ length: 18 }, (_, index) =>
        makeRun({
          id: `run_success_${index}`,
          createdAt: `2026-03-09T0${Math.floor(index / 2)}:${index % 2 === 0 ? "00" : "30"}:00.000Z`,
          durationMs: 180 + index,
        })
      ),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id);

    expect(summary.status).toBe("healthy");
    expect(summary.successRate).toBe(0.95);
    expect(summary.summaryText).toContain('Task "Check API health" (task_1) is healthy.');
    expect(summary.summaryText).toContain("Last failure: 20 hours ago");
  });

  it("returns failing after three consecutive failures", async () => {
    const task = makeTask({ name: "Sync Stripe data" });
    const runs = [
      makeRun({ id: "run_1", status: "failure", errorMessage: "HTTP 503", createdAt: "2026-03-09T09:59:00.000Z", durationMs: 300 }),
      makeRun({ id: "run_2", status: "timeout", errorMessage: "timeout", createdAt: "2026-03-09T09:50:00.000Z", durationMs: null }),
      makeRun({ id: "run_3", status: "failure", errorMessage: "connection reset", createdAt: "2026-03-09T09:40:00.000Z", durationMs: 310 }),
      makeRun({ id: "run_4", createdAt: "2026-03-09T09:20:00.000Z", durationMs: 190 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id);

    expect(summary.status).toBe("failing");
    expect(summary.consecutiveFailures).toBe(3);
    expect(summary.summaryText).toContain("Current issue: 3 consecutive failures.");
    expect(summary.lastFailure?.errorMessage).toBe("HTTP 503");
  });

  it("returns needs_attention for intermittent failures without a failure streak", async () => {
    const task = makeTask({ name: "Lead follow-up" });
    const runs = [
      makeRun({ id: "run_latest", createdAt: "2026-03-09T09:58:00.000Z", durationMs: 220 }),
      makeRun({ id: "run_fail_1", status: "failure", errorMessage: "HTTP 429", createdAt: "2026-03-09T08:00:00.000Z", durationMs: 250 }),
      makeRun({ id: "run_ok_1", createdAt: "2026-03-09T07:30:00.000Z", durationMs: 205 }),
      makeRun({ id: "run_fail_2", status: "timeout", errorMessage: "timeout", createdAt: "2026-03-09T06:00:00.000Z", durationMs: null }),
      makeRun({ id: "run_ok_2", createdAt: "2026-03-09T05:30:00.000Z", durationMs: 210 }),
      makeRun({ id: "run_ok_3", createdAt: "2026-03-09T05:00:00.000Z", durationMs: 215 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id);

    expect(summary.status).toBe("needs_attention");
    expect(summary.consecutiveFailures).toBe(0);
    expect(summary.summaryText).toContain("needs attention");
  });

  it("returns degrading when latency worsens without failures", async () => {
    const task = makeTask({ name: "Adaptive monitor" });
    const runs = [
      makeRun({ id: "run_1", createdAt: "2026-03-09T09:50:00.000Z", durationMs: 170 }),
      makeRun({ id: "run_2", createdAt: "2026-03-09T09:40:00.000Z", durationMs: 180 }),
      makeRun({ id: "run_3", createdAt: "2026-03-09T09:30:00.000Z", durationMs: 190 }),
      makeRun({ id: "run_4", createdAt: "2026-03-09T09:20:00.000Z", durationMs: 100 }),
      makeRun({ id: "run_5", createdAt: "2026-03-09T09:10:00.000Z", durationMs: 110 }),
      makeRun({ id: "run_6", createdAt: "2026-03-09T09:00:00.000Z", durationMs: 120 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id);

    expect(summary.status).toBe("degrading");
    expect(summary.durationTrend.direction).toBe("up");
    expect(summary.summaryText).toContain("Duration trend: up");
  });

  it("returns idle when no runs exist in scope", async () => {
    const task = makeTask({ active: false });
    const runs = [
      makeRun({ id: "run_old", createdAt: "2026-03-01T09:00:00.000Z", durationMs: 200 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id, { windowHours: 12 });

    expect(summary.status).toBe("idle");
    expect(summary.counts.total).toBe(0);
    expect(summary.summaryText).toContain("paused");
  });

  it("handles missing durations when calculating averages", async () => {
    const task = makeTask();
    const runs = [
      makeRun({ id: "run_1", createdAt: "2026-03-09T09:58:00.000Z", durationMs: null }),
      makeRun({ id: "run_2", createdAt: "2026-03-09T09:50:00.000Z", durationMs: 200 }),
      makeRun({ id: "run_3", createdAt: "2026-03-09T09:40:00.000Z", durationMs: 300 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id);

    expect(summary.averageDurationMs).toBe(250);
  });

  it("passes limit through to runs.list and applies the time window", async () => {
    const task = makeTask();
    const runs = [
      makeRun({ id: "run_recent", createdAt: "2026-03-09T09:58:00.000Z", durationMs: 200 }),
      makeRun({ id: "run_old", createdAt: "2026-03-07T09:58:00.000Z", durationMs: 210 }),
    ];

    fetchMock
      .mockResolvedValueOnce(okResponse(task))
      .mockResolvedValueOnce(okResponse(runs));

    const client = new CloudClient({ apiKey: "test-key" });
    const summary = await client.tasks.summarize(task.id, { limit: 7, windowHours: 1 });

    const runsUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(runsUrl).toContain("taskId=task_1");
    expect(runsUrl).toContain("limit=7");
    expect(summary.counts.total).toBe(1);
  });

  it("summarizeAll orders items by severity and recency", async () => {
    const failingTask = makeTask({ id: "task_fail", name: "Sync Stripe data" });
    const degradingTask = makeTask({ id: "task_degrade", name: "API monitor" });
    const healthyTask = makeTask({ id: "task_ok", name: "Weekly digest" });

    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);

      if (url.endsWith("/v1/tasks")) {
        return okResponse([failingTask, degradingTask, healthyTask]);
      }

      if (url.includes("/v1/runs?taskId=task_fail")) {
        return okResponse([
          makeRun({ taskId: "task_fail", id: "fail_1", status: "failure", errorMessage: "timeout", createdAt: "2026-03-09T09:59:00.000Z", durationMs: null }),
          makeRun({ taskId: "task_fail", id: "fail_2", status: "failure", errorMessage: "timeout", createdAt: "2026-03-09T09:49:00.000Z", durationMs: null }),
          makeRun({ taskId: "task_fail", id: "fail_3", status: "timeout", errorMessage: "timeout", createdAt: "2026-03-09T09:39:00.000Z", durationMs: null }),
        ]);
      }

      if (url.includes("/v1/runs?taskId=task_degrade")) {
        return okResponse([
          makeRun({ taskId: "task_degrade", id: "deg_1", createdAt: "2026-03-09T09:58:00.000Z", durationMs: 190 }),
          makeRun({ taskId: "task_degrade", id: "deg_2", createdAt: "2026-03-09T09:48:00.000Z", durationMs: 180 }),
          makeRun({ taskId: "task_degrade", id: "deg_3", createdAt: "2026-03-09T09:38:00.000Z", durationMs: 170 }),
          makeRun({ taskId: "task_degrade", id: "deg_4", createdAt: "2026-03-09T09:28:00.000Z", durationMs: 100 }),
          makeRun({ taskId: "task_degrade", id: "deg_5", createdAt: "2026-03-09T09:18:00.000Z", durationMs: 90 }),
          makeRun({ taskId: "task_degrade", id: "deg_6", createdAt: "2026-03-09T09:08:00.000Z", durationMs: 80 }),
        ]);
      }

      if (url.includes("/v1/runs?taskId=task_ok")) {
        return okResponse([
          makeRun({ taskId: "task_ok", id: "ok_1", createdAt: "2026-03-09T09:57:00.000Z", durationMs: 200 }),
          makeRun({ taskId: "task_ok", id: "ok_2", createdAt: "2026-03-09T09:47:00.000Z", durationMs: 210 }),
          makeRun({ taskId: "task_ok", id: "ok_3", createdAt: "2026-03-09T09:37:00.000Z", durationMs: 220 }),
        ]);
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const client = new CloudClient({ apiKey: "test-key" });
    const overview = await client.tasks.summarizeAll();

    expect(overview.items.map((item) => item.taskId)).toEqual(["task_fail", "task_degrade", "task_ok"]);
    expect(overview.summaryText).toContain("3 tasks, 2 need attention.");
    expect(overview.items[0]?.summaryText).toContain("3 consecutive failures");
  });
});
