import { CloudApiClient } from "./lib/api.js";
import { readConfig } from "./lib/config.js";
import { DispatchQueueRuntime } from "./lib/dispatcher.js";

const config = readConfig();

const apiClient = new CloudApiClient(config.apiBaseUrl, config.internalToken);
const runtime = new DispatchQueueRuntime(config.redisUrl, config.queueName, apiClient);

let polling = true;

async function pollLoop(): Promise<void> {
  while (polling) {
    try {
      const due = await apiClient.claimDueDispatches(100);
      for (const instruction of due) {
        await runtime.enqueue(instruction);
      }
    } catch (error) {
      console.error("poll error", error);
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
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
