import { CloudApiClient } from "./lib/api.js";
import { readConfig } from "./lib/config.js";
import { DispatchQueueRuntime } from "./lib/dispatcher.js";

const config = readConfig();

const apiClient = new CloudApiClient(config.apiBaseUrl, config.internalToken);
const runtime = new DispatchQueueRuntime(config.redisUrl, config.queueName, apiClient);

let polling = true;
let warnedApiUnavailable = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionRefused(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; cause?: unknown };
  if (value.code === "ECONNREFUSED") {
    return true;
  }

  if (value.cause && typeof value.cause === "object") {
    const cause = value.cause as { code?: unknown };
    return cause.code === "ECONNREFUSED";
  }

  return false;
}

async function pollLoop(): Promise<void> {
  while (polling) {
    try {
      const due = await apiClient.claimDueTasks(100);
      warnedApiUnavailable = false;
      for (const instruction of due) {
        await runtime.enqueue(instruction);
      }
    } catch (error) {
      if (isConnectionRefused(error)) {
        if (!warnedApiUnavailable) {
          warnedApiUnavailable = true;
          console.warn(`cloud-api not reachable at ${config.apiBaseUrl}; waiting for startup...`);
        }
        await sleep(1000);
        continue;
      }
      console.error("poll error", error);
    }

    await sleep(config.pollIntervalMs);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.warn(`received ${signal}, shutting down cloud worker`);
  polling = false;
  await runtime.close();
  process.exit(0);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await pollLoop();
