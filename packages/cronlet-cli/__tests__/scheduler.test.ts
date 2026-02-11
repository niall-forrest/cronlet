import { describe, it, expect, beforeEach, vi } from "vitest";
import { CronScheduler } from "../src/scheduler/index.js";
import type { JobDefinition } from "cronlet";

// Mock the engine
vi.mock("cronlet", async () => {
  const actual = await vi.importActual("cronlet");
  return {
    ...actual,
    engine: {
      run: vi.fn(),
    },
  };
});

import { engine } from "cronlet";

const createMockJob = (id: string, cronExpr = "0 * * * *"): JobDefinition => ({
  id,
  name: id,
  schedule: {
    type: "interval",
    cron: cronExpr,
    humanReadable: "every hour",
    originalParams: {},
  },
  config: {},
  handler: async () => {},
});

describe("CronScheduler", () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    scheduler = new CronScheduler();
    vi.clearAllMocks();
  });

  describe("basic operations", () => {
    it("adds and removes jobs", () => {
      const job = createMockJob("test-job");
      scheduler.add(job);

      expect(scheduler.getJobs()).toHaveLength(1);
      expect(scheduler.getJobs()[0].id).toBe("test-job");

      scheduler.remove("test-job");
      expect(scheduler.getJobs()).toHaveLength(0);
    });

    it("starts and stops", () => {
      expect(scheduler.isRunning()).toBe(false);

      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it("clears all jobs", () => {
      scheduler.add(createMockJob("job-1"));
      scheduler.add(createMockJob("job-2"));
      expect(scheduler.getJobs()).toHaveLength(2);

      scheduler.clear();
      expect(scheduler.getJobs()).toHaveLength(0);
    });
  });

  describe("in-flight tracking", () => {
    it("tracks in-flight jobs during execution", async () => {
      const job = createMockJob("test-job");
      let resolveJob: () => void;
      const jobPromise = new Promise<void>((resolve) => {
        resolveJob = resolve;
      });

      vi.mocked(engine.run).mockImplementation(async () => {
        await jobPromise;
        return {
          jobId: job.id,
          runId: "test-run",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempt: 1,
        };
      });

      const executePromise = scheduler.executeJob(job);

      // Job should be in-flight
      expect(scheduler.getInFlightCount()).toBe(1);

      // Complete the job
      resolveJob!();
      await executePromise;

      // Job should no longer be in-flight
      expect(scheduler.getInFlightCount()).toBe(0);
    });
  });

  describe("shutdown behavior", () => {
    it("blocks new jobs during shutdown", async () => {
      const job = createMockJob("test-job");

      // Start shutdown
      const shutdownPromise = scheduler.shutdown(100);

      // Try to execute during shutdown
      const result = await scheduler.executeJob(job);

      expect(result.status).toBe("failure");
      expect(result.error?.message).toBe("Scheduler is shutting down");

      await shutdownPromise;
    });

    it("returns empty when no jobs in flight", async () => {
      const result = await scheduler.shutdown(100);

      expect(result.completed).toEqual([]);
      expect(result.interrupted).toEqual([]);
    });

    it("waits for in-flight jobs to complete", async () => {
      const job = createMockJob("test-job");
      let resolveJob: () => void;

      vi.mocked(engine.run).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveJob = resolve;
        });
        return {
          jobId: job.id,
          runId: "test-run",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempt: 1,
        };
      });

      // Start job execution
      const executePromise = scheduler.executeJob(job);

      // Start shutdown while job is running
      const shutdownPromise = scheduler.shutdown(5000);

      // Complete the job
      resolveJob!();
      await executePromise;

      const result = await shutdownPromise;
      expect(result.completed).toContain("test-job");
      expect(result.interrupted).toEqual([]);
    });

    it("reports interrupted jobs after timeout", async () => {
      const job = createMockJob("slow-job");

      // Job that never completes
      vi.mocked(engine.run).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Start job execution (don't await)
      scheduler.executeJob(job);

      // Shutdown with short timeout
      const result = await scheduler.shutdown(50);

      expect(result.completed).toEqual([]);
      expect(result.interrupted).toContain("slow-job");
    });

    it("reports isShuttingDown correctly during shutdown", async () => {
      const job = createMockJob("test-job");
      let resolveJob: () => void;

      vi.mocked(engine.run).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveJob = resolve;
        });
        return {
          jobId: job.id,
          runId: "test-run",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempt: 1,
        };
      });

      expect(scheduler.isShuttingDown()).toBe(false);

      // Start a job
      const executePromise = scheduler.executeJob(job);

      // Start shutdown
      const shutdownPromise = scheduler.shutdown(5000);
      expect(scheduler.isShuttingDown()).toBe(true);

      // Complete the job
      resolveJob!();
      await executePromise;
      await shutdownPromise;

      expect(scheduler.isShuttingDown()).toBe(false);
    });
  });
});
