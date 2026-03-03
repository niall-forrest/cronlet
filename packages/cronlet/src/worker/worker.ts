import { Cron } from "croner";
import { discoverJobs } from "../job/discover.js";
import { registry } from "../job/registry.js";
import { engine } from "../engine/executor.js";
import type { ExecutionResult } from "../engine/types.js";
import type { JobDefinition } from "../job/types.js";
import type { WorkerOptions, Worker, Logger } from "./types.js";
import { createDefaultLogger } from "./logger.js";
import { startHealthServer, type HealthServer } from "./health.js";

interface InFlightExecution {
  jobId: string;
  promise: Promise<ExecutionResult>;
}

export class CronletWorker implements Worker {
  private options: WorkerOptions;
  private logger: Logger;
  private crons: Map<string, Cron> = new Map();
  private jobs: JobDefinition[] = [];
  private inFlight: Map<string, InFlightExecution> = new Map();
  private activeJobCounts: Map<string, number> = new Map();
  private queuedJobs: Map<string, Promise<ExecutionResult>> = new Map();
  private catchupQueued: Set<string> = new Set();
  private running = false;
  private shuttingDown = false;
  private healthServer: HealthServer | null = null;
  private startedAt = new Date();
  private unsubscribers: Array<() => void> = [];
  private signalHandlers: Array<{ signal: NodeJS.Signals; handler: () => void }> = [];

  constructor(options: WorkerOptions) {
    this.options = options;
    this.logger = options.logger ?? createDefaultLogger();
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.logger.info("Worker starting...");
    this.startedAt = new Date();

    this.jobs = await discoverJobs({ directory: this.options.dir });

    if (this.jobs.length === 0) {
      this.logger.warn("No jobs discovered");
    } else {
      this.logger.info(`Discovered ${this.jobs.length} job${this.jobs.length === 1 ? "" : "s"}:`);
      for (const job of this.jobs) {
        this.logger.info(`  ${job.id}  ${job.schedule.humanReadable}`);
      }
    }

    this.wireEngineEvents();

    for (const job of this.jobs) {
      const cron = new Cron(
        job.schedule.cron,
        { timezone: job.schedule.timezone ?? this.options.timezone },
        () => this.executeJob(job)
      );
      this.crons.set(job.id, cron);
    }

    this.running = true;

    const healthOpts = this.options.healthCheck;
    if (healthOpts?.enabled !== false) {
      const port = healthOpts?.port ?? parseInt(process.env.PORT ?? "3141", 10);
      const path = healthOpts?.path ?? "/health";
      try {
        this.healthServer = await startHealthServer(
          port,
          path,
          () => this.jobs,
          this.startedAt,
          this.logger
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Health check server failed to start: ${msg}`);
      }
    }

    this.registerSignalHandlers();

    this.logger.info("Worker ready.");
    this.options.onReady?.(this.jobs);
  }

  async stop(): Promise<void> {
    if (!this.running || this.shuttingDown) return;
    this.shuttingDown = true;

    this.logger.info("Shutting down...");

    for (const cron of this.crons.values()) {
      cron.stop();
    }
    this.crons.clear();

    if (this.inFlight.size > 0) {
      this.logger.info(
        `Waiting for ${this.inFlight.size} in-flight job${this.inFlight.size === 1 ? "" : "s"}...`
      );

      const timeout = this.options.shutdownTimeout ?? 30_000;
      const deadline = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), timeout));
      const all = Promise.all(
        Array.from(this.inFlight.values()).map((entry) => entry.promise.catch(() => {}))
      ).then(() => "done" as const);

      const result = await Promise.race([all, deadline]);
      if (result === "timeout") {
        this.logger.warn(
          `Shutdown timeout — ${this.inFlight.size} job${this.inFlight.size === 1 ? "" : "s"} interrupted`
        );
      }
    }

    if (this.healthServer) {
      await this.healthServer.close().catch(() => {});
      this.healthServer = null;
    }

    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.unregisterSignalHandlers();

    this.running = false;
    this.shuttingDown = false;
    this.logger.info("Goodbye.");
  }

  getJobs(): JobDefinition[] {
    return this.jobs;
  }

  async trigger(jobId: string): Promise<ExecutionResult> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    return this.executeJob(job);
  }

  isRunning(): boolean {
    return this.running;
  }

  private async executeJob(job: JobDefinition): Promise<ExecutionResult> {
    if (this.shuttingDown) {
      return this.createSkippedResult(job, "Worker is shutting down");
    }

    const policy = job.config.concurrency ?? "skip";

    if (policy === "allow") {
      return this.runJob(job);
    }

    if (policy === "queue") {
      return this.enqueueJob(job);
    }

    // Default policy: skip overlapping runs
    const hasQueuedRun = this.queuedJobs.has(job.id);
    if (this.isJobActive(job.id) || hasQueuedRun) {
      if (!job.config.catchup) {
        return this.createSkippedResult(job, "Job is already running or queued (concurrency=skip)");
      }

      const queued = this.queueCatchupRun(job);
      return this.createSkippedResult(
        job,
        queued
          ? "Job is already running; scheduled one catch-up run"
          : "Job is already running; catch-up run already queued"
      );
    }

    return this.runJob(job);
  }

  private createSkippedResult(job: JobDefinition, message: string): ExecutionResult {
    return {
      jobId: job.id,
      runId: `skipped_${Date.now()}`,
      status: "failure",
      startedAt: new Date(),
      completedAt: new Date(),
      duration: 0,
      attempt: 0,
      error: { message },
    };
  }

  private isJobActive(jobId: string): boolean {
    return (this.activeJobCounts.get(jobId) ?? 0) > 0;
  }

  private incrementActiveJob(jobId: string): void {
    this.activeJobCounts.set(jobId, (this.activeJobCounts.get(jobId) ?? 0) + 1);
  }

  private decrementActiveJob(jobId: string): void {
    const nextCount = (this.activeJobCounts.get(jobId) ?? 1) - 1;
    if (nextCount <= 0) {
      this.activeJobCounts.delete(jobId);
      return;
    }
    this.activeJobCounts.set(jobId, nextCount);
  }

  private waitForActiveRuns(jobId: string): Promise<void> {
    const activePromises = Array.from(this.inFlight.values())
      .filter((entry) => entry.jobId === jobId)
      .map((entry) => entry.promise);

    if (activePromises.length === 0) {
      return Promise.resolve();
    }

    return Promise.allSettled(activePromises).then(() => undefined);
  }

  private enqueueJob(job: JobDefinition, waitFor?: Promise<void>): Promise<ExecutionResult> {
    const base = this.queuedJobs.get(job.id) ?? waitFor ?? Promise.resolve();
    const next = base
      .catch(() => undefined)
      .then(() => this.runJob(job));

    const tracked = next.finally(() => {
      if (this.queuedJobs.get(job.id) === tracked) {
        this.queuedJobs.delete(job.id);
      }
    });

    this.queuedJobs.set(job.id, tracked);
    return tracked;
  }

  private queueCatchupRun(job: JobDefinition): boolean {
    if (this.catchupQueued.has(job.id)) {
      return false;
    }

    this.catchupQueued.add(job.id);
    const waitFor = this.waitForActiveRuns(job.id);
    this.enqueueJob(job, waitFor).finally(() => {
      this.catchupQueued.delete(job.id);
    });
    return true;
  }

  private async runJob(job: JobDefinition): Promise<ExecutionResult> {
    if (this.shuttingDown) {
      return this.createSkippedResult(job, "Worker is shutting down");
    }

    const promise = engine.run(job);
    const key = `${job.id}_${Date.now()}`;
    this.inFlight.set(key, { jobId: job.id, promise });
    this.incrementActiveJob(job.id);

    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
      this.decrementActiveJob(job.id);
    }
  }

  private wireEngineEvents(): void {
    this.unsubscribers.push(
      engine.on("job:start", (event) => {
        const time = new Date().toLocaleTimeString();
        this.logger.info(`[${time}] Running ${event.jobId} (${event.runId.slice(0, 16)}...)`);
        this.options.onJobStart?.(event.jobId, event.runId);
      })
    );

    this.unsubscribers.push(
      engine.on("job:success", (event) => {
        const time = new Date().toLocaleTimeString();
        const duration = event.duration ? `${(event.duration / 1000).toFixed(1)}s` : "0s";
        this.logger.info(`[${time}] \u2713 ${event.jobId} completed in ${duration}`);
      })
    );

    this.unsubscribers.push(
      engine.on("job:failure", (event) => {
        const time = new Date().toLocaleTimeString();
        this.logger.error(
          `[${time}] \u2717 ${event.jobId} failed: ${event.error?.message ?? "Unknown error"}`
        );
        if (event.error) {
          this.options.onJobError?.(
            event.jobId,
            new Error(event.error.message)
          );
        }
      })
    );

    this.unsubscribers.push(
      engine.on("job:timeout", (event) => {
        const time = new Date().toLocaleTimeString();
        this.logger.error(`[${time}] \u2717 ${event.jobId} timed out`);
        this.options.onJobError?.(event.jobId, new Error("Job timed out"));
      })
    );

    this.unsubscribers.push(
      engine.on("job:retry", (event) => {
        const time = new Date().toLocaleTimeString();
        this.logger.warn(`[${time}] Retrying ${event.jobId} (attempt ${event.attempt + 1})`);
      })
    );

    this.unsubscribers.push(
      engine.on("job:success", (event) => {
        const job = registry.getById(event.jobId);
        if (job) {
          const result: ExecutionResult = {
            jobId: event.jobId,
            runId: event.runId,
            status: "success",
            startedAt: event.timestamp,
            completedAt: event.timestamp,
            duration: event.duration ?? 0,
            attempt: event.attempt,
          };
          this.options.onJobComplete?.(event.jobId, result);
        }
      })
    );

    this.unsubscribers.push(
      engine.on("job:failure", (event) => {
        const result: ExecutionResult = {
          jobId: event.jobId,
          runId: event.runId,
          status: "failure",
          startedAt: event.timestamp,
          completedAt: event.timestamp,
          duration: event.duration ?? 0,
          attempt: event.attempt,
          error: event.error,
        };
        this.options.onJobComplete?.(event.jobId, result);
      })
    );
  }

  private registerSignalHandlers(): void {
    if (this.signalHandlers.length > 0) {
      return;
    }

    const register = (signal: NodeJS.Signals): void => {
      const handler = () => {
        this.logger.info(`Received ${signal}`);
        void this.stop().finally(() => process.exit(0));
      };
      process.on(signal, handler);
      this.signalHandlers.push({ signal, handler });
    };

    register("SIGTERM");
    register("SIGINT");
  }

  private unregisterSignalHandlers(): void {
    for (const { signal, handler } of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers = [];
  }
}
