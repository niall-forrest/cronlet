import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudClient, CronletError, RateLimitError } from "../src/index";

describe("RateLimitError", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws RateLimitError for 429 responses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        "retry-after": "120",
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1710072000",
      }),
      json: async () => ({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Task creation rate limit exceeded. Max 60 per hour.",
          details: { retryAfter: 120 },
        },
      }),
    } as Response);

    const client = new CloudClient({ apiKey: "test-key" });

    await expect(client.tasks.list()).rejects.toMatchObject({
      name: "RateLimitError",
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: 120,
      limit: 60,
      remaining: 0,
      reset: 1710072000,
    });
  });

  it("keeps non-429 API failures as CronletError", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({
        ok: false,
        error: {
          code: "TASK_LIMIT_EXCEEDED",
          message: "Task limit reached",
          details: { limit: 10 },
        },
      }),
    } as Response);

    const client = new CloudClient({ apiKey: "test-key" });

    let caught: unknown;
    try {
      await client.tasks.list();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CronletError);
    expect(caught).not.toBeInstanceOf(RateLimitError);
    expect(caught).toMatchObject({
      code: "TASK_LIMIT_EXCEEDED",
      status: 403,
      details: { limit: 10 },
    });
  });
});
