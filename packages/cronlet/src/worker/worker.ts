import { Cron } from "croner";
import { discoverJobs } from "../job/discover.js";
import { registry } from "../job/registry.js";
import { engine } from "../engine/executor.js";
import type { ExecutionResult } from "../engine/types.js";
import type { JobDefinition } from "../job/types.js";
import type { WorkerOptions, Worker, Logger } from "./types.js";
import { createDefaultLogger } from "./logger.js";
import { startHealthServer, type HealthServer } from "./health.js";

export class CronletWorker implements Worker {
  private options: WorkerOptions;
  private logger: Logger;
  private crons: Map<string, Cron> = new Map();
  private jobs: JobDefinition[] = [];
  private inFlight: Map<string, Promise<ExecutionResult>> = new Map();
  private running = false;
  private shuttingDown = false;
  private healthServer: HealthServer | null = null;
  private startedAt = new Date();
  private unsubscribers: Array<() => void> = [];

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
        Array.from(this.inFlight.values()).map((p) => p.catch(() => {}))
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
      return {
        jobId: job.id,
        runId: `skipped_${Date.now()}`,
        status: "failure",
        startedAt: new Date(),
        completedAt: new Date(),
        duration: 0,
        attempt: 0,
        error: { message: "Worker is shutting down" },
      };
    }

    const promise = engine.run(job);
    const key = `${job.id}_${Date.now()}`;
    this.inFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
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
    const handle = (signal: string) => {
      this.logger.info(`Received ${signal}`);
      this.stop().then(() => process.exit(0));
    };

    process.on("SIGTERM", () => handle("SIGTERM"));
    process.on("SIGINT", () => handle("SIGINT"));
  }
}
