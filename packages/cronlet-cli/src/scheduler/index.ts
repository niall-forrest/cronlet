import { Cron } from "croner";
import { engine, type JobDefinition, type ExecutionResult } from "cronlet";

/**
 * Scheduled job entry
 */
interface ScheduledJob {
  job: JobDefinition;
  cron: Cron;
}

/**
 * In-flight job execution
 */
interface InFlightJob {
  jobId: string;
  runId: string;
  startedAt: Date;
  promise: Promise<ExecutionResult>;
}

/**
 * Cron scheduler that runs jobs on their defined schedules
 */
export class CronScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private inFlightJobs: Map<string, InFlightJob> = new Map();
  private activeJobCounts: Map<string, number> = new Map();
  private queuedJobs: Map<string, Promise<ExecutionResult>> = new Map();
  private catchupQueued: Set<string> = new Set();
  private running = false;
  private shuttingDown = false;

  /**
   * Add a job to the scheduler
   */
  add(job: JobDefinition): void {
    // Remove existing if any
    this.remove(job.id);

    // Parse the cron expression
    const cronExpr = job.schedule.cron;

    // Croner supports seconds as first field if 6 fields
    const options: Record<string, unknown> = {
      timezone: job.schedule.timezone,
      paused: !this.running,
    };

    const cron = new Cron(cronExpr, options, async () => {
      await this.executeJob(job);
    });

    this.scheduledJobs.set(job.id, { job, cron });
  }

  /**
   * Remove a job from the scheduler
   */
  remove(jobId: string): boolean {
    const scheduled = this.scheduledJobs.get(jobId);
    if (scheduled) {
      scheduled.cron.stop();
      this.scheduledJobs.delete(jobId);
      return true;
    }
    return false;
  }

  /**
   * Execute a job immediately
   */
  async executeJob(job: JobDefinition): Promise<ExecutionResult> {
    // Don't start new jobs if shutting down
    if (this.shuttingDown) {
      return this.createSkippedResult(job, "Scheduler is shutting down");
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
    const activePromises = Array.from(this.inFlightJobs.values())
      .filter((inFlight) => inFlight.jobId === jobId)
      .map((inFlight) => inFlight.promise);

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
      return this.createSkippedResult(job, "Scheduler is shutting down");
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startedAt = new Date();
    const promise = engine.run(job);

    // Track in-flight job
    const inFlight: InFlightJob = { jobId: job.id, runId, startedAt, promise };
    this.inFlightJobs.set(runId, inFlight);
    this.incrementActiveJob(job.id);

    try {
      const result = await promise;
      return result;
    } finally {
      this.inFlightJobs.delete(runId);
      this.decrementActiveJob(job.id);
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    for (const { cron } of this.scheduledJobs.values()) {
      cron.resume();
    }
  }

  /**
   * Stop the scheduler (does not wait for in-flight jobs)
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const { cron } of this.scheduledJobs.values()) {
      cron.pause();
    }
  }

  /**
   * Gracefully shutdown the scheduler
   * Stops accepting new jobs and waits for in-flight jobs to complete
   *
   * @param timeoutMs - Maximum time to wait for jobs (default: 30 seconds)
   * @returns List of jobs that were still running when timeout expired
   */
  async shutdown(timeoutMs = 30000): Promise<{ completed: string[]; interrupted: string[] }> {
    this.shuttingDown = true;
    this.stop();

    const completed: string[] = [];
    const interrupted: string[] = [];

    if (this.inFlightJobs.size === 0) {
      return { completed, interrupted };
    }

    // Wait for in-flight jobs with timeout
    const inFlightEntries = Array.from(this.inFlightJobs.entries());
    const promises = inFlightEntries.map(async ([runId, inFlight]) => {
      try {
        await inFlight.promise;
        completed.push(inFlight.jobId);
      } catch {
        // Job failed, but it did complete
        completed.push(inFlight.jobId);
      }
      return runId;
    });

    // Race between all jobs completing and timeout
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), timeoutMs);
    });

    const allJobsPromise = Promise.all(promises).then(() => "done" as const);

    const result = await Promise.race([allJobsPromise, timeoutPromise]);

    if (result === "timeout") {
      // Mark remaining jobs as interrupted
      for (const [, inFlight] of this.inFlightJobs) {
        if (!completed.includes(inFlight.jobId)) {
          interrupted.push(inFlight.jobId);
        }
      }
    }

    this.shuttingDown = false;
    return { completed, interrupted };
  }

  /**
   * Get number of in-flight jobs
   */
  getInFlightCount(): number {
    return this.inFlightJobs.size;
  }

  /**
   * Check if scheduler is shutting down
   */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Stop and clear all jobs
   */
  clear(): void {
    for (const { cron } of this.scheduledJobs.values()) {
      cron.stop();
    }
    this.scheduledJobs.clear();
  }

  /**
   * Get all scheduled jobs
   */
  getJobs(): JobDefinition[] {
    return Array.from(this.scheduledJobs.values()).map((s) => s.job);
  }

  /**
   * Get next run time for a job
   */
  getNextRun(jobId: string): Date | null {
    const scheduled = this.scheduledJobs.get(jobId);
    if (!scheduled) return null;

    const next = scheduled.cron.nextRun();
    return next ?? null;
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
