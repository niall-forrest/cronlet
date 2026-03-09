import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CloudClient,
  ScheduleParseError,
  createToolHandler,
} from "../src/index";

function okResponse(data: unknown) {
  return {
    ok: true,
    json: async () => ({ ok: true, data }),
  } as Response;
}

describe("sdk string schedule support", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes string schedules for task creation", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "task_123" }));
    const client = new CloudClient({ apiKey: "test-key" });

    await client.tasks.create({
      name: "Weekly digest",
      handler: {
        type: "webhook",
        url: "https://example.com/digest",
        method: "POST",
      },
      schedule: "every friday at 9am",
      timezone: "UTC",
      retryAttempts: 1,
      retryBackoff: "linear",
      retryDelay: "1s",
      timeout: "30s",
      active: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.schedule).toEqual({
      type: "weekly",
      days: ["fri"],
      time: "09:00",
    });
  });

  it("normalizes string schedules for task patching", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "task_123" }));
    const client = new CloudClient({ apiKey: "test-key" });

    await client.tasks.patch("task_123", {
      schedule: "once at 2026-03-15 09:00",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.schedule).toEqual({
      type: "once",
      at: "2026-03-15T09:00:00.000Z",
    });
  });

  it("passes structured schedules through unchanged", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "task_123" }));
    const client = new CloudClient({ apiKey: "test-key" });

    await client.tasks.create({
      name: "Health check",
      handler: {
        type: "webhook",
        url: "https://example.com/health",
        method: "GET",
      },
      schedule: { type: "every", interval: "5m" },
      timezone: "UTC",
      retryAttempts: 1,
      retryBackoff: "linear",
      retryDelay: "1s",
      timeout: "30s",
      active: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.schedule).toEqual({ type: "every", interval: "5m" });
  });

  it("throws ScheduleParseError before issuing a request", async () => {
    const client = new CloudClient({ apiKey: "test-key" });

    expect(() =>
      client.tasks.create({
        name: "Bad task",
        handler: {
          type: "webhook",
          url: "https://example.com/bad",
          method: "POST",
        },
        schedule: "every other friday",
        timezone: "UTC",
        retryAttempts: 1,
        retryBackoff: "linear",
        retryDelay: "1s",
        timeout: "30s",
        active: true,
      })
    ).toThrow(ScheduleParseError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves string schedules in the tool handler", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "task_123" }));
    const client = new CloudClient({ apiKey: "test-key" });
    const handler = createToolHandler(client);

    const result = await handler.execute("cronlet_create_task", {
      name: "Digest",
      handler: {
        type: "webhook",
        url: "https://example.com/digest",
        method: "POST",
      },
      schedule: "daily at 9am",
    });

    expect(result.success).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.schedule).toEqual({
      type: "daily",
      times: ["09:00"],
    });
  });
});
