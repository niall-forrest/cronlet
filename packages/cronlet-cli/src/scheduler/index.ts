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
 * Cron scheduler that runs jobs on their defined schedules
 */
export class CronScheduler {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private running = false;

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
    return engine.run(job);
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
   * Stop the scheduler
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const { cron } of this.scheduledJobs.values()) {
      cron.pause();
    }
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
