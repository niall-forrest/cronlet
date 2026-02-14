import type { WorkerOptions, Worker } from "./types.js";
import { CronletWorker } from "./worker.js";

export function createWorker(options: WorkerOptions): Worker {
  return new CronletWorker(options);
}

export type { WorkerOptions, Worker, Logger } from "./types.js";
