import { createHash, createHmac, randomUUID } from "node:crypto";
import type {
  DispatchInstruction,
  HandlerConfig,
  WebhookHandlerConfig,
  ToolsHandlerConfig,
  TaskCallbackPayload,
  TaskCallbackEventType,
} from "@cronlet/shared";
import type { CloudApiClient } from "./api.js";
import { executeTool, type ToolContext } from "./tools/index.js";
import { SecretsCache } from "./secrets.js";

interface HandlerResult {
  output: Record<string, unknown> | null;
  logs: string;
  httpStatus?: number | null;
  responseBodyPreview?: string | null;
  responseBodyHash?: string | null;
}

class DeliveryError extends Error {
  constructor(
    message: string,
    readonly classification: "retryable" | "terminal_client_error",
    readonly httpStatus?: number,
    readonly responseBodyPreview?: string,
    readonly responseBodyHash?: string,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

function signCallbackPayload(timestamp: string, body: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}.${body}`);
  return `v1=${hmac.digest("hex")}`;
}

export class DispatchQueueRuntime {
  private readonly secretsCache: SecretsCache;

  constructor(
    _redisUrl: string,
    _queueName: string,
    private readonly api: CloudApiClient
  ) {
    // Initialize secrets cache with 5 minute TTL
    this.secretsCache = new SecretsCache(api, 5 * 60 * 1000);
    this.secretsCache.start();
  }

  async processInstruction(instruction: DispatchInstruction): Promise<void> {
    const startedAt = Date.now();
    const attempt = instruction.attemptNumber;

    await this.api.startDispatchAttempt({
      dispatchJobId: instruction.dispatchJobId,
      attemptId: instruction.attemptId,
      attemptNumber: attempt,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), instruction.timeoutMs);

    try {
      const result = await this.executeHandler(instruction, controller.signal);
      const durationMs = Date.now() - startedAt;

      await this.api.completeDispatchAttempt({
        dispatchJobId: instruction.dispatchJobId,
        attemptId: instruction.attemptId,
        attemptNumber: attempt,
        status: "success",
        durationMs,
        output: result.output,
        logs: result.logs || null,
        httpStatus: result.httpStatus ?? null,
        responseBodyPreview: result.responseBodyPreview ?? null,
        responseBodyHash: result.responseBodyHash ?? null,
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
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startedAt;
      const deliveryError = error instanceof DeliveryError ? error : null;
      const status = isTimeout
        ? "timeout"
        : deliveryError?.classification === "terminal_client_error"
          ? "terminal_client_error"
          : "failure";

      await this.api.completeDispatchAttempt({
        dispatchJobId: instruction.dispatchJobId,
        attemptId: instruction.attemptId,
        attemptNumber: attempt,
        status,
        durationMs,
        httpStatus: deliveryError?.httpStatus ?? null,
        errorClass: error instanceof Error ? error.name : "Error",
        errorMessage: message,
        responseBodyPreview: deliveryError?.responseBodyPreview ?? null,
        responseBodyHash: deliveryError?.responseBodyHash ?? null,
      });

      await this.sendCallback(instruction, "task.run.failed", {
        status: isTimeout ? "timeout" : "failure",
        output: null,
        errorMessage: message,
        durationMs,
        attempt,
      });

      await this.checkTaskExpiration(instruction);
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
        name: instruction.taskName,
        externalId: instruction.taskExternalId,
        metadata: instruction.metadata,
      },
      stats: {
        totalRuns: newRunCount,
        remainingRuns,
        expiresAt: instruction.expiresAt,
      },
    };

    if (runInfo) {
      payload.run = {
        id: instruction.runId,
        status: runInfo.status,
        scheduledAt: null,
        output: runInfo.output,
        errorMessage: runInfo.errorMessage,
        durationMs: runInfo.durationMs,
        attempt: runInfo.attempt,
      };
      payload.attempt = {
        id: instruction.attemptId,
        number: runInfo.attempt,
      };
    }

    if (expirationReason) {
      payload.reason = expirationReason;
    }
    payload.callbackDeliveryId = randomUUID();
    payload.signature = { version: "v1" };

    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify(payload);
      const response = await fetch(instruction.callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cronlet-event": event,
          "x-cronlet-timestamp": timestamp,
          "x-cronlet-delivery-id": payload.callbackDeliveryId,
          "x-cronlet-signature-version": "v1",
          "x-cronlet-signature": instruction.callbackSigningSecret
            ? signCallbackPayload(timestamp, body, instruction.callbackSigningSecret)
            : "",
        },
        body,
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
    const newRunCount = instruction.runCount + 1;
    if (instruction.maxRuns !== null && newRunCount >= instruction.maxRuns) {
      await this.sendCallback(
        instruction,
        "task.expired",
        undefined,
        "max_runs_reached"
      );
      return;
    }

    if (instruction.expiresAt && new Date(instruction.expiresAt).getTime() <= Date.now()) {
      await this.sendCallback(
        instruction,
        "task.expired",
        undefined,
        "expired_at_reached"
      );
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
      redirect: config.followRedirects ? "follow" : "manual",
      signal,
    });

    const responseText = await response.text();
    const responseBodyPreview = responseText.slice(0, 400);
    const responseBodyHash = createHash("sha256").update(responseText).digest("hex");
    let responseJson: Record<string, unknown> | null = null;

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      // Not JSON, that's okay
    }

    if (!response.ok) {
      const terminalStatusCodes = new Set([
        400,
        401,
        403,
        404,
        410,
        422,
        ...instruction.retryPolicy.terminalStatusCodes,
      ]);
      const retryStatusCodes = new Set([
        408,
        409,
        425,
        429,
        ...Array.from({ length: 100 }, (_, index) => 500 + index),
        ...instruction.retryPolicy.retryOnStatusCodes,
      ]);
      const classification = terminalStatusCodes.has(response.status) && !retryStatusCodes.has(response.status)
        ? "terminal_client_error"
        : "retryable";
      throw new DeliveryError(
        `Webhook responded ${response.status}: ${responseBodyPreview}`,
        classification,
        response.status,
        responseBodyPreview,
        responseBodyHash,
      );
    }

    return {
      output: responseJson,
      logs: `${method} ${config.url} -> ${response.status}`,
      httpStatus: response.status,
      responseBodyPreview,
      responseBodyHash,
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
  }
}
