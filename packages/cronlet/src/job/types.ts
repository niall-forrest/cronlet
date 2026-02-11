import type { ScheduleDescriptor } from "../schedule/types.js";

/**
 * Context passed to job handlers during execution
 */
export interface JobContext {
  /** Unique identifier for the job */
  jobId: string;
  /** Human-readable name of the job */
  jobName: string;
  /** Unique identifier for this specific run */
  runId: string;
  /** When this run was scheduled to execute */
  scheduledAt: Date;
  /** When the handler actually started */
  startedAt: Date;
  /** Current attempt number (1-based) */
  attempt: number;
  /** Signal that can be used to handle cancellation */
  signal: AbortSignal;
}

/**
 * Job handler function signature
 */
export type JobHandler = (context: JobContext) => Promise<void> | void;

/**
 * Backoff strategy for retries
 */
export type BackoffStrategy = "linear" | "exponential";

/**
 * Retry configuration for jobs
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  attempts: number;
  /** Backoff strategy between retries */
  backoff?: BackoffStrategy;
  /** Initial delay before first retry (e.g., "1m", "30s") */
  initialDelay?: string;
}

/**
 * Job configuration options
 */
export interface JobConfig {
  /** Optional explicit name for the job */
  name?: string;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Maximum execution time (e.g., "5m", "30s") */
  timeout?: string;
  /** Callback when job fails after all retries */
  onFailure?: (error: Error, context: JobContext) => Promise<void> | void;
  /** Callback when job succeeds */
  onSuccess?: (context: JobContext) => Promise<void> | void;
}

/**
 * Complete job definition
 */
export interface JobDefinition {
  /** Unique identifier for the job (derived from filename or explicit) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Schedule configuration */
  schedule: ScheduleDescriptor;
  /** Job configuration */
  config: JobConfig;
  /** The handler function to execute */
  handler: JobHandler;
  /** Source file path (populated by file-based discovery) */
  filePath?: string;
}

/**
 * Internal representation used during registration
 */
export interface JobRegistration {
  schedule: ScheduleDescriptor;
  config: JobConfig;
  handler: JobHandler;
}
