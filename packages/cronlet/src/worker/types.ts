import type { ExecutionResult } from "../engine/types.js";
import type { JobDefinition } from "../job/types.js";

export interface Logger {
  info(msg: string): void;
  error(msg: string): void;
  warn(msg: string): void;
}

export interface HealthCheckOptions {
  enabled?: boolean;
  port?: number;
  path?: string;
}

export interface WorkerOptions {
  dir: string;
  timezone?: string;
  healthCheck?: HealthCheckOptions;
  shutdownTimeout?: number;
  onJobStart?: (jobId: string, runId: string) => void;
  onJobComplete?: (jobId: string, result: ExecutionResult) => void;
  onJobError?: (jobId: string, error: Error) => void;
  onReady?: (jobs: JobDefinition[]) => void;
  logger?: Logger;
}

export interface Worker {
  start(): Promise<void>;
  stop(): Promise<void>;
  getJobs(): JobDefinition[];
  trigger(jobId: string): Promise<ExecutionResult>;
  isRunning(): boolean;
}
