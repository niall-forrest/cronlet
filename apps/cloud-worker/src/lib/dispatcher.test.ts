import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchInstruction } from "@cronlet/shared";
import { DispatchQueueRuntime } from "./dispatcher.js";
import { createOutboundPolicyFromEnv } from "./outbound.js";

function instruction(overrides: Partial<DispatchInstruction> = {}): DispatchInstruction {
  return {
    dispatchJobId: "dispatch_123",
    attemptId: "attempt_123",
    attemptNumber: 1,
    runId: "run_123",
    orgId: "org_123",
    taskId: "task_123",
    taskName: "Digest Task",
    taskExternalId: "external_123",
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
    retryPolicy: {
      maxAttempts: 2,
      backoff: "linear",
      initialDelay: "1s",
      maxDelay: "15m",
      jitter: true,
      retryWindow: "24h",
      retryOnStatusCodes: [],
      terminalStatusCodes: [],
    },
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }));
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
    Reflect.set(runtime as object, "outboundPolicy", {
      allowedHosts: null,
      resolveHostname: async () => ["93.184.216.34"],
    });
    const sendCallback = Reflect.get(runtime as object, "sendCallback") as (
      instruction: DispatchInstruction,
      event: string,
      runInfo: {
        status: "success" | "failure" | "timeout";
        output: Record<string, unknown> | null;
        errorMessage: string | null;
        durationMs: number;
        attempt: number;
      },
    ) => Promise<void>;

    await sendCallback.call(
      runtime,
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
    expect(init.redirect).toBe("manual");

    const body = JSON.parse(String(init.body));
    expect(body.task.name).toBe("Digest Task");
    expect(body.stats.expiresAt).toBe("2026-03-27T12:00:00.000Z");
    expect(body.stats.totalRuns).toBe(2);
  });

  it("emits task.expired for expiresAt-based expiration", async () => {
    const runtime = Object.create(DispatchQueueRuntime.prototype) as DispatchQueueRuntime;
    const sendCallback = vi.fn().mockResolvedValue(undefined);
    Reflect.set(runtime as object, "sendCallback", sendCallback);
    const checkTaskExpiration = Reflect.get(runtime as object, "checkTaskExpiration") as (
      instruction: DispatchInstruction,
    ) => Promise<void>;

    await checkTaskExpiration.call(
      runtime,
      instruction({ maxRuns: null })
    );

    expect(sendCallback).toHaveBeenCalledWith(
      expect.any(Object),
      "task.expired",
      undefined,
      "expired_at_reached"
    );
  });

  it("skips callback delivery to blocked local targets", async () => {
    const runtime = Object.create(DispatchQueueRuntime.prototype) as DispatchQueueRuntime;
    Reflect.set(runtime as object, "outboundPolicy", createOutboundPolicyFromEnv());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await Reflect.get(runtime as object, "sendCallback").call(
      runtime,
      instruction({ callbackUrl: "http://127.0.0.1:4050/internal/callback" }),
      "task.run.completed",
      {
        status: "success",
        output: { ok: true },
        errorMessage: null,
        durationMs: 40,
        attempt: 1,
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("blocked address 127.0.0.1"));
    warnSpy.mockRestore();
  });

  it("revalidates redirect targets before following webhook redirects", async () => {
    const runtime = Object.create(DispatchQueueRuntime.prototype) as DispatchQueueRuntime;
    Reflect.set(runtime as object, "outboundPolicy", {
      allowedHosts: null,
      resolveHostname: async (hostname: string) => hostname === "example.com" ? ["93.184.216.34"] : ["127.0.0.1"],
    });
    fetchMock.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: {
        location: "http://127.0.0.1:4050/internal",
      },
    }));

    const executeWebhookHandler = Reflect.get(runtime as object, "executeWebhookHandler") as (
      instruction: DispatchInstruction,
      config: DispatchInstruction["handlerConfig"] & { type: "webhook" },
      signal: AbortSignal,
    ) => Promise<unknown>;

    await expect(executeWebhookHandler.call(
      runtime,
      instruction(),
      {
        type: "webhook",
        url: "https://example.com/hook",
        method: "POST",
        followRedirects: true,
        maxRedirects: 1,
      },
      new AbortController().signal,
    )).rejects.toThrow(/blocked address 127.0.0.1/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
