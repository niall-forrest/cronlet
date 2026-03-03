import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { DispatchInstruction } from "@cronlet/cloud-shared";
import type { CloudApiClient } from "./api.js";
import { parseDurationToMs } from "./time.js";

interface DispatchJobData {
  instruction: DispatchInstruction;
}

export class DispatchQueueRuntime {
  readonly queue: Queue<DispatchJobData, unknown, string, DispatchJobData>;
  readonly worker: Worker<DispatchJobData>;

  constructor(
    redisUrl: string,
    queueName: string,
    private readonly api: CloudApiClient
  ) {
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<DispatchJobData>(queueName, { connection });

    this.worker = new Worker<DispatchJobData>(
      queueName,
      async (job) => this.process(job),
      { connection }
    );
  }

  async enqueue(instruction: DispatchInstruction): Promise<void> {
    const initialDelayMs = parseDurationToMs(instruction.retryInitialDelay);
    await this.queue.add(
      "dispatch-run",
      { instruction },
      {
        jobId: instruction.runId,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: instruction.retryAttempts,
        backoff: {
          type: instruction.retryBackoff,
          delay: initialDelayMs,
        },
      }
    );
  }

  private async process(job: Job<DispatchJobData>): Promise<void> {
    const { instruction } = job.data;
    const startedAt = Date.now();
    const attempt = job.attemptsMade + 1;

    await this.api.updateRunStatus(instruction.runId, {
      status: "running",
      attempt,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), instruction.timeoutMs);

    try {
      const response = await fetch(instruction.endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ runId: instruction.runId, jobId: instruction.jobId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Endpoint responded ${response.status}${body ? `: ${body.slice(0, 400)}` : ""}`);
      }

      await this.api.updateRunStatus(instruction.runId, {
        status: "success",
        attempt,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const attempts = job.opts.attempts ?? 1;
      const isFinalAttempt = attempt >= attempts;
      const message = error instanceof Error ? error.message : String(error);

      if (isFinalAttempt) {
        await this.api.updateRunStatus(instruction.runId, {
          status: isTimeout ? "timeout" : "failure",
          attempt,
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        });
      } else {
        await this.api.updateRunStatus(instruction.runId, {
          status: "queued",
          attempt,
          durationMs: Date.now() - startedAt,
          errorMessage: `Retrying: ${message}`,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
