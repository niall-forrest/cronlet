import type { JobContext, JobDefinition } from "../job/types.js";
import type {
  ExecutionResult,
  ExecutionEvent,
  ExecutionEventListener,
  ExecutionError,
} from "./types.js";
import { parseDuration, createTimeoutPromise, isTimeoutError } from "./timeout.js";
import { calculateRetryDelay, shouldRetry, sleep } from "./retry.js";

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Default timeout in milliseconds (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Execution engine for running jobs
 */
export class ExecutionEngine {
  private listeners: Map<string, Set<ExecutionEventListener>> = new Map();

  /**
   * Subscribe to execution events
   *
   * @param event - Event type to listen for, or "*" for all events
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on(
    event: string,
    listener: ExecutionEventListener
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: ExecutionEvent): void {
    // Notify specific listeners
    this.listeners.get(event.type)?.forEach((listener) => listener(event));
    // Notify wildcard listeners
    this.listeners.get("*")?.forEach((listener) => listener(event));
  }

  /**
   * Execute a single attempt of a job
   */
  private async executeAttempt(
    job: JobDefinition,
    runId: string,
    attempt: number,
    abortController: AbortController
  ): Promise<void> {
    const context: JobContext = {
      jobId: job.id,
      jobName: job.name,
      runId,
      scheduledAt: new Date(),
      startedAt: new Date(),
      attempt,
      signal: abortController.signal,
    };

    // Get timeout duration
    const timeoutMs = job.config.timeout
      ? parseDuration(job.config.timeout)
      : DEFAULT_TIMEOUT_MS;

    // Create timeout promise
    const { promise: timeoutPromise, clear: clearTimeout } =
      createTimeoutPromise(timeoutMs);

    try {
      // Race between handler and timeout
      await Promise.race([
        Promise.resolve(job.handler(context)),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout();
    }
  }

  /**
   * Run a job with full retry and timeout handling
   *
   * @param job - Job definition to execute
   * @returns Execution result
   */
  async run(job: JobDefinition): Promise<ExecutionResult> {
    const runId = generateRunId();
    const startedAt = new Date();
    let attempt = 1;
    let lastError: Error | null = null;

    const abortController = new AbortController();

    // Emit start event
    this.emit({
      type: "job:start",
      jobId: job.id,
      runId,
      timestamp: new Date(),
      attempt,
    });

    const maxAttempts = job.config.retry?.attempts ?? 1;

    while (attempt <= maxAttempts) {
      try {
        await this.executeAttempt(job, runId, attempt, abortController);

        // Success!
        const completedAt = new Date();
        const result: ExecutionResult = {
          jobId: job.id,
          runId,
          status: "success",
          startedAt,
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          attempt,
        };

        // Emit success event
        this.emit({
          type: "job:success",
          jobId: job.id,
          runId,
          timestamp: completedAt,
          attempt,
          duration: result.duration,
        });

        // Call onSuccess callback if provided
        if (job.config.onSuccess) {
          try {
            await job.config.onSuccess({
              jobId: job.id,
              jobName: job.name,
              runId,
              scheduledAt: startedAt,
              startedAt,
              attempt,
              signal: abortController.signal,
            });
          } catch {
            // Ignore errors in onSuccess callback
          }
        }

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        const isTimeout = isTimeoutError(err);
        const errorInfo: ExecutionError = {
          message: lastError.message,
          stack: lastError.stack,
        };

        // Check if we should retry
        if (job.config.retry && shouldRetry(attempt, job.config.retry)) {
          // Emit retry event
          this.emit({
            type: "job:retry",
            jobId: job.id,
            runId,
            timestamp: new Date(),
            attempt,
            error: errorInfo,
          });

          // Calculate delay and wait
          const delay = calculateRetryDelay(attempt, job.config.retry);
          await sleep(delay);

          attempt++;
          continue;
        }

        // No more retries - this is a failure
        const completedAt = new Date();
        const result: ExecutionResult = {
          jobId: job.id,
          runId,
          status: isTimeout ? "timeout" : "failure",
          startedAt,
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          attempt,
          error: errorInfo,
        };

        // Emit failure or timeout event
        this.emit({
          type: isTimeout ? "job:timeout" : "job:failure",
          jobId: job.id,
          runId,
          timestamp: completedAt,
          attempt,
          error: errorInfo,
          duration: result.duration,
        });

        // Call onFailure callback if provided
        if (job.config.onFailure) {
          try {
            await job.config.onFailure(lastError, {
              jobId: job.id,
              jobName: job.name,
              runId,
              scheduledAt: startedAt,
              startedAt,
              attempt,
              signal: abortController.signal,
            });
          } catch {
            // Ignore errors in onFailure callback
          }
        }

        return result;
      }
    }

    // Should never reach here, but TypeScript needs this
    const completedAt = new Date();
    return {
      jobId: job.id,
      runId,
      status: "failure",
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      attempt,
      error: lastError
        ? { message: lastError.message, stack: lastError.stack }
        : { message: "Unknown error" },
    };
  }

  /**
   * Remove all event listeners
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

/**
 * Singleton execution engine instance
 */
export const engine = new ExecutionEngine();
