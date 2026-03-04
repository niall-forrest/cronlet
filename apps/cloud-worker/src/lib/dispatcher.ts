import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type {
  DispatchInstruction,
  HandlerConfig,
  WebhookHandlerConfig,
  ToolsHandlerConfig,
  TaskCallbackPayload,
  TaskCallbackEventType,
} from "@cronlet/cloud-shared";
import type { CloudApiClient } from "./api.js";
import { parseDurationToMs } from "./time.js";
import { executeTool, type ToolContext } from "./tools/index.js";
import { SecretsCache } from "./secrets.js";

interface DispatchJobData {
  instruction: DispatchInstruction;
}

interface HandlerResult {
  output: Record<string, unknown> | null;
  logs: string;
}

export class DispatchQueueRuntime {
  readonly queue: Queue<DispatchJobData, unknown, string, DispatchJobData>;
  readonly worker: Worker<DispatchJobData>;
  private readonly secretsCache: SecretsCache;
  private redisUnavailableWarned = false;

  constructor(
    redisUrl: string,
    queueName: string,
    private readonly api: CloudApiClient
  ) {
    const connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (attempts) => Math.min(attempts * 1000, 15000),
    });

    connection.on("ready", () => {
      if (this.redisUnavailableWarned) {
        this.redisUnavailableWarned = false;
        console.info("redis connection restored for cloud worker");
      }
    });

    // ioredis can emit frequent connection errors during local startup; keep logs concise.
    connection.on("error", (error: unknown) => {
      if (this.redisUnavailableWarned) {
        return;
      }
      this.redisUnavailableWarned = true;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`redis unavailable at ${redisUrl}; worker queue paused until connection recovers (${message})`);
    });

    this.queue = new Queue<DispatchJobData>(queueName, { connection });

    this.worker = new Worker<DispatchJobData>(
      queueName,
      async (job) => this.process(job),
      { connection }
    );

    // Initialize secrets cache with 5 minute TTL
    this.secretsCache = new SecretsCache(api, 5 * 60 * 1000);
    this.secretsCache.start();
  }

  async enqueue(instruction: DispatchInstruction): Promise<void> {
    const initialDelayMs = parseDurationToMs(instruction.retryDelay);
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
      const result = await this.executeHandler(instruction, controller.signal);
      const durationMs = Date.now() - startedAt;

      await this.api.updateRunStatus(instruction.runId, {
        status: "success",
        attempt,
        durationMs,
        output: result.output,
        logs: result.logs || null,
      });

      // Send callback if configured (task.run.completed)
      await this.sendCallback(instruction, "task.run.completed", {
        status: "success",
        output: result.output,
        errorMessage: null,
        durationMs,
        attempt,
      });

      // Check if task should expire after this run
      await this.checkTaskExpiration(instruction);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const attempts = job.opts.attempts ?? 1;
      const isFinalAttempt = attempt >= attempts;
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;

      if (isFinalAttempt) {
        await this.api.updateRunStatus(instruction.runId, {
          status: isTimeout ? "timeout" : "failure",
          attempt,
          durationMs,
          errorMessage: message,
        });

        // Send callback for final failure (task.run.failed)
        await this.sendCallback(instruction, "task.run.failed", {
          status: isTimeout ? "timeout" : "failure",
          output: null,
          errorMessage: message,
          durationMs,
          attempt,
        });

        // Check if task should expire after this run
        await this.checkTaskExpiration(instruction);
      } else {
        await this.api.updateRunStatus(instruction.runId, {
          status: "queued",
          attempt,
          durationMs,
          errorMessage: `Retrying: ${message}`,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendCallback(
    instruction: DispatchInstruction,
    event: TaskCallbackEventType,
    runInfo?: {
      status: "success" | "failure" | "timeout";
      output: Record<string, unknown> | null;
      errorMessage: string | null;
      durationMs: number;
      attempt: number;
    },
    expirationReason?: "max_runs_reached" | "expired_at_reached"
  ): Promise<void> {
    if (!instruction.callbackUrl) {
      return;
    }

    const newRunCount = instruction.runCount + 1;
    const remainingRuns = instruction.maxRuns !== null
      ? Math.max(0, instruction.maxRuns - newRunCount)
      : null;

    const payload: TaskCallbackPayload = {
      event,
      timestamp: new Date().toISOString(),
      task: {
        id: instruction.taskId,
        name: "", // We don't have task name in instruction, but taskId is sufficient
        metadata: instruction.metadata,
      },
      stats: {
        totalRuns: newRunCount,
        remainingRuns,
        expiresAt: null, // We don't track expiresAt in instruction currently
      },
    };

    if (runInfo) {
      payload.run = {
        id: instruction.runId,
        status: runInfo.status,
        output: runInfo.output,
        errorMessage: runInfo.errorMessage,
        durationMs: runInfo.durationMs,
        attempt: runInfo.attempt,
      };
    }

    if (expirationReason) {
      payload.reason = expirationReason;
    }

    try {
      const response = await fetch(instruction.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cronlet-event": event,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`Callback to ${instruction.callbackUrl} failed with status ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Callback to ${instruction.callbackUrl} failed: ${message}`);
    }
  }

  private async checkTaskExpiration(instruction: DispatchInstruction): Promise<void> {
    if (instruction.maxRuns === null) {
      return;
    }

    const newRunCount = instruction.runCount + 1;
    if (newRunCount >= instruction.maxRuns) {
      // Task has reached max runs, send expiration callback
      await this.sendCallback(
        instruction,
        "task.expired",
        undefined,
        "max_runs_reached"
      );

      // Note: The API should handle pausing the task when runCount reaches maxRuns
      // The worker just sends the callback to notify the agent
    }
  }

  private async executeHandler(instruction: DispatchInstruction, signal: AbortSignal): Promise<HandlerResult> {
    const config = instruction.handlerConfig;

    switch (config.type) {
      case "webhook":
        return this.executeWebhookHandler(instruction, config, signal);
      case "tools":
        return this.executeToolsHandler(instruction, config, signal);
      case "code":
        throw new Error("Code handler not yet implemented");
      default:
        throw new Error(`Unknown handler type: ${(config as HandlerConfig).type}`);
    }
  }

  private async executeWebhookHandler(
    instruction: DispatchInstruction,
    config: WebhookHandlerConfig,
    signal: AbortSignal
  ): Promise<HandlerResult> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...config.headers,
    };

    // Handle auth if configured
    if (config.auth) {
      const secretValue = await this.secretsCache.get(instruction.orgId, config.auth.secretName);
      switch (config.auth.type) {
        case "bearer":
          headers["authorization"] = `Bearer ${secretValue}`;
          break;
        case "basic":
          headers["authorization"] = `Basic ${Buffer.from(secretValue).toString("base64")}`;
          break;
        case "header":
          // Assume format "Header-Name: value"
          const [headerName, ...rest] = secretValue.split(":");
          if (headerName) {
            headers[headerName.trim()] = rest.join(":").trim();
          }
          break;
      }
    }

    const method = config.method ?? "POST";
    const body = method === "GET" ? undefined : JSON.stringify(
      config.body ?? { runId: instruction.runId, taskId: instruction.taskId }
    );

    const response = await fetch(config.url, {
      method,
      headers,
      body,
      signal,
    });

    const responseText = await response.text();
    let responseJson: Record<string, unknown> | null = null;

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // Not JSON, that's okay
    }

    if (!response.ok) {
      throw new Error(`Webhook responded ${response.status}: ${responseText.slice(0, 400)}`);
    }

    return {
      output: responseJson,
      logs: `${method} ${config.url} -> ${response.status}`,
    };
  }

  private async executeToolsHandler(
    instruction: DispatchInstruction,
    config: ToolsHandlerConfig,
    signal: AbortSignal
  ): Promise<HandlerResult> {
    const logs: string[] = [];
    const outputs: Record<string, unknown> = {};

    // Create tool context with secrets getter
    const ctx: ToolContext = {
      orgId: instruction.orgId,
      signal,
      getSecret: this.secretsCache.createGetter(instruction.orgId),
    };

    for (const step of config.steps) {
      if (signal.aborted) {
        throw new Error("Execution aborted");
      }

      logs.push(`[step] ${step.tool}`);

      // Interpolate args with previous outputs
      const args = this.interpolateArgs(step.args, outputs);

      // Execute the tool via registry
      const result = await executeTool(step.tool, args, ctx);

      // Store output if outputKey specified
      if (step.outputKey) {
        outputs[step.outputKey] = result;
      }

      logs.push(`[result] ${JSON.stringify(result).slice(0, 200)}`);
    }

    return {
      output: outputs,
      logs: logs.join("\n"),
    };
  }

  private interpolateArgs(args: Record<string, unknown>, outputs: Record<string, unknown>): Record<string, unknown> {
    const interpolated: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string") {
        interpolated[key] = value.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
          const parts = path.split(".");
          let current: unknown = outputs;
          for (const part of parts) {
            if (current && typeof current === "object" && part in current) {
              current = (current as Record<string, unknown>)[part];
            } else {
              return `{{${path}}}`; // Keep original if not found
            }
          }
          return String(current);
        });
      } else if (typeof value === "object" && value !== null) {
        interpolated[key] = this.interpolateArgs(value as Record<string, unknown>, outputs);
      } else {
        interpolated[key] = value;
      }
    }

    return interpolated;
  }

  async close(): Promise<void> {
    this.secretsCache.stop();
    await this.worker.close();
    await this.queue.close();
  }
}
