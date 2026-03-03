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

const createMockJob = (
  id: string,
  cronExpr = "0 * * * *",
  config: JobDefinition["config"] = {}
): JobDefinition => ({
  id,
  name: id,
  schedule: {
    type: "interval",
    cron: cronExpr,
    humanReadable: "every hour",
    originalParams: {},
  },
  config,
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

  describe("concurrency policies", () => {
    it("skips overlapping runs by default", async () => {
      const job = createMockJob("skip-job", "0 * * * *", { concurrency: "skip" });
      let resolveFirst: () => void;

      vi.mocked(engine.run).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
        return {
          jobId: job.id,
          runId: "run-1",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempt: 1,
        };
      });

      const firstExecution = scheduler.executeJob(job);
      const overlapResult = await scheduler.executeJob(job);

      expect(overlapResult.status).toBe("failure");
      expect(overlapResult.error?.message).toBe("Job is already running or queued (concurrency=skip)");
      expect(engine.run).toHaveBeenCalledTimes(1);

      resolveFirst!();
      await firstExecution;
    });

    it("queues overlapping runs when configured", async () => {
      const job = createMockJob("queue-job", "0 * * * *", { concurrency: "queue" });
      let resolveFirst: () => void;

      vi.mocked(engine.run)
        .mockImplementationOnce(async () => {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
          return {
            jobId: job.id,
            runId: "run-1",
            status: "success",
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 100,
            attempt: 1,
          };
        })
        .mockImplementationOnce(async () => ({
          jobId: job.id,
          runId: "run-2",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
          attempt: 1,
        }));

      const firstExecution = scheduler.executeJob(job);
      const secondExecution = scheduler.executeJob(job);

      await vi.waitFor(() => {
        expect(engine.run).toHaveBeenCalledTimes(1);
      });
      resolveFirst!();

      const [firstResult, secondResult] = await Promise.all([firstExecution, secondExecution]);

      expect(firstResult.runId).toBe("run-1");
      expect(secondResult.runId).toBe("run-2");
      expect(engine.run).toHaveBeenCalledTimes(2);
    });

    it("allows overlapping runs when configured", async () => {
      const job = createMockJob("allow-job", "0 * * * *", { concurrency: "allow" });
      let resolveGate: () => void;
      const gate = new Promise<void>((resolve) => {
        resolveGate = resolve;
      });

      vi.mocked(engine.run).mockImplementation(async () => {
        await gate;
        return {
          jobId: job.id,
          runId: "allow-run",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 100,
          attempt: 1,
        };
      });

      const firstExecution = scheduler.executeJob(job);
      const secondExecution = scheduler.executeJob(job);

      expect(engine.run).toHaveBeenCalledTimes(2);
      expect(scheduler.getInFlightCount()).toBe(2);

      resolveGate!();
      await Promise.all([firstExecution, secondExecution]);
    });

    it("schedules a single catch-up run when skip+catchup is enabled", async () => {
      const job = createMockJob("catchup-job", "0 * * * *", {
        concurrency: "skip",
        catchup: true,
      });
      let resolveFirst: () => void;

      vi.mocked(engine.run)
        .mockImplementationOnce(async () => {
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
          return {
            jobId: job.id,
            runId: "run-1",
            status: "success",
            startedAt: new Date(),
            completedAt: new Date(),
            duration: 100,
            attempt: 1,
          };
        })
        .mockImplementationOnce(async () => ({
          jobId: job.id,
          runId: "run-2",
          status: "success",
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 50,
          attempt: 1,
        }));

      const firstExecution = scheduler.executeJob(job);
      const overlapOne = await scheduler.executeJob(job);
      const overlapTwo = await scheduler.executeJob(job);

      expect(overlapOne.error?.message).toBe("Job is already running; scheduled one catch-up run");
      expect(overlapTwo.error?.message).toBe("Job is already running; catch-up run already queued");
      expect(engine.run).toHaveBeenCalledTimes(1);

      resolveFirst!();
      await firstExecution;

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(engine.run).toHaveBeenCalledTimes(2);
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
