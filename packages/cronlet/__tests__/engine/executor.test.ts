import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionEngine } from "../../src/engine/executor.js";
import type { JobDefinition } from "../../src/job/types.js";

describe("ExecutionEngine", () => {
  let engine: ExecutionEngine;

  const createMockJob = (
    handler: () => Promise<void> | void,
    config: JobDefinition["config"] = {}
  ): JobDefinition => ({
    id: "test-job",
    name: "Test Job",
    schedule: {
      type: "interval",
      cron: "*/15 * * * *",
      humanReadable: "every 15 minutes",
      originalParams: {},
    },
    config,
    handler,
  });

  beforeEach(() => {
    engine = new ExecutionEngine();
  });

  describe("run()", () => {
    it("executes a successful job", async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const job = createMockJob(handler);

      const result = await engine.run(job);

      expect(result.status).toBe("success");
      expect(result.jobId).toBe("test-job");
      expect(result.attempt).toBe(1);
      expect(result.error).toBeUndefined();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("handles a failing job", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Job failed"));
      const job = createMockJob(handler);

      const result = await engine.run(job);

      expect(result.status).toBe("failure");
      expect(result.error?.message).toBe("Job failed");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("handles sync handlers", async () => {
      const handler = vi.fn();
      const job = createMockJob(handler);

      const result = await engine.run(job);

      expect(result.status).toBe("success");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("provides correct context to handler", async () => {
      let receivedContext: unknown;
      const handler = vi.fn((ctx) => {
        receivedContext = ctx;
      });
      const job = createMockJob(handler);

      await engine.run(job);

      expect(receivedContext).toMatchObject({
        jobId: "test-job",
        jobName: "Test Job",
        attempt: 1,
      });
      expect((receivedContext as Record<string, unknown>).runId).toMatch(/^run_/);
      expect((receivedContext as Record<string, unknown>).signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("retries", () => {
    it("retries on failure", async () => {
      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("First fail"))
        .mockRejectedValueOnce(new Error("Second fail"))
        .mockResolvedValue(undefined);

      const job = createMockJob(handler, {
        retry: { attempts: 3, initialDelay: "10ms" },
      });

      const result = await engine.run(job);

      expect(result.status).toBe("success");
      expect(result.attempt).toBe(3);
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("fails after max retries", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Always fails"));

      const job = createMockJob(handler, {
        retry: { attempts: 2, initialDelay: "10ms" },
      });

      const result = await engine.run(job);

      expect(result.status).toBe("failure");
      expect(result.attempt).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("timeout", () => {
    it("times out long-running jobs", async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      });

      const job = createMockJob(handler, { timeout: "50ms" });

      const result = await engine.run(job);

      expect(result.status).toBe("timeout");
      expect(result.error?.message).toContain("timed out");
    });
  });

  describe("events", () => {
    it("emits job:start event", async () => {
      const listener = vi.fn();
      engine.on("job:start", listener);

      const job = createMockJob(() => {});
      await engine.run(job);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job:start",
          jobId: "test-job",
        })
      );
    });

    it("emits job:success event", async () => {
      const listener = vi.fn();
      engine.on("job:success", listener);

      const job = createMockJob(() => {});
      await engine.run(job);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job:success",
          jobId: "test-job",
        })
      );
    });

    it("emits job:failure event", async () => {
      const listener = vi.fn();
      engine.on("job:failure", listener);

      const job = createMockJob(() => {
        throw new Error("Failed");
      });
      await engine.run(job);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job:failure",
          jobId: "test-job",
          error: expect.objectContaining({ message: "Failed" }),
        })
      );
    });

    it("emits job:retry event", async () => {
      const listener = vi.fn();
      engine.on("job:retry", listener);

      const handler = vi
        .fn()
        .mockRejectedValueOnce(new Error("Fail"))
        .mockResolvedValue(undefined);

      const job = createMockJob(handler, {
        retry: { attempts: 2, initialDelay: "10ms" },
      });
      await engine.run(job);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "job:retry",
          jobId: "test-job",
        })
      );
    });

    it("supports wildcard listener", async () => {
      const listener = vi.fn();
      engine.on("*", listener);

      const job = createMockJob(() => {});
      await engine.run(job);

      // Should receive start and success events
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it("unsubscribes correctly", async () => {
      const listener = vi.fn();
      const unsubscribe = engine.on("job:start", listener);

      unsubscribe();

      const job = createMockJob(() => {});
      await engine.run(job);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("callbacks", () => {
    it("calls onSuccess callback", async () => {
      const onSuccess = vi.fn();
      const job = createMockJob(() => {}, { onSuccess });

      await engine.run(job);

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("calls onFailure callback", async () => {
      const onFailure = vi.fn();
      const job = createMockJob(
        () => {
          throw new Error("Failed");
        },
        { onFailure }
      );

      await engine.run(job);

      expect(onFailure).toHaveBeenCalledTimes(1);
      expect(onFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ jobId: "test-job" })
      );
    });
  });
});
