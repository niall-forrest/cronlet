import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchInstruction } from "@cronlet/shared";
import { DispatchQueueRuntime } from "./dispatcher.js";

function instruction(overrides: Partial<DispatchInstruction> = {}): DispatchInstruction {
  return {
    runId: "run_123",
    orgId: "org_123",
    taskId: "task_123",
    taskName: "Digest Task",
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://example.com/hook",
      method: "POST",
    },
    timeoutMs: 30_000,
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "1s",
    callbackUrl: "https://example.com/callback",
    callbackSigningSecret: "crsig_test_secret",
    metadata: {
      reportId: "report_123",
    },
    maxRuns: 3,
    expiresAt: "2026-03-27T12:00:00.000Z",
    runCount: 1,
    ...overrides,
  };
}

describe("DispatchQueueRuntime callback delivery", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("signs callbacks and includes task name and expiresAt", async () => {
    const runtime = Object.create(DispatchQueueRuntime.prototype) as DispatchQueueRuntime;

    await (runtime as { sendCallback: Function }).sendCallback(
      instruction(),
      "task.run.completed",
      {
        status: "success",
        output: { ok: true },
        errorMessage: null,
        durationMs: 125,
        attempt: 1,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-cronlet-event")).toBe("task.run.completed");
    expect(headers.get("x-cronlet-timestamp")).toBe("1774612800");
    expect(headers.get("x-cronlet-signature")).toMatch(/^v1=/);

    const body = JSON.parse(String(init.body));
    expect(body.task.name).toBe("Digest Task");
    expect(body.stats.expiresAt).toBe("2026-03-27T12:00:00.000Z");
    expect(body.stats.totalRuns).toBe(2);
  });

  it("emits task.expired for expiresAt-based expiration", async () => {
    const runtime = Object.create(DispatchQueueRuntime.prototype) as DispatchQueueRuntime & {
      sendCallback: ReturnType<typeof vi.fn>;
    };
    runtime.sendCallback = vi.fn().mockResolvedValue(undefined);

    await (runtime as { checkTaskExpiration: Function }).checkTaskExpiration(
      instruction({ maxRuns: null })
    );

    expect(runtime.sendCallback).toHaveBeenCalledWith(
      expect.any(Object),
      "task.expired",
      undefined,
      "expired_at_reached"
    );
  });
});
