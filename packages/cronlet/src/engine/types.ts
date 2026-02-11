/**
 * Status of a job execution
 */
export type ExecutionStatus = "success" | "failure" | "timeout" | "retrying";

/**
 * Error information from a failed execution
 */
export interface ExecutionError {
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
}

/**
 * Result of a job execution
 */
export interface ExecutionResult {
  /** The job that was executed */
  jobId: string;
  /** Unique identifier for this run */
  runId: string;
  /** Final status of the execution */
  status: ExecutionStatus;
  /** When the execution started */
  startedAt: Date;
  /** When the execution completed */
  completedAt: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** Which attempt this was (1-based) */
  attempt: number;
  /** Error details if failed */
  error?: ExecutionError;
}

/**
 * Events emitted by the execution engine
 */
export type ExecutionEventType =
  | "job:start"
  | "job:success"
  | "job:failure"
  | "job:retry"
  | "job:timeout";

/**
 * Event payload for execution events
 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  jobId: string;
  runId: string;
  timestamp: Date;
  attempt: number;
  error?: ExecutionError;
  duration?: number;
}

/**
 * Event listener function
 */
export type ExecutionEventListener = (event: ExecutionEvent) => void;
