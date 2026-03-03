export interface WorkerConfig {
  apiBaseUrl: string;
  internalToken: string;
  redisUrl: string;
  pollIntervalMs: number;
  queueName: string;
}

export function readConfig(): WorkerConfig {
  const apiBaseUrl = process.env.CLOUD_API_BASE_URL ?? "http://127.0.0.1:4050";
  const internalToken = process.env.CLOUD_INTERNAL_TOKEN;
  const redisUrl = process.env.REDIS_URL;
  const pollIntervalMs = Number.parseInt(process.env.CLOUD_POLL_INTERVAL_MS ?? "15000", 10);
  const queueName = process.env.CLOUD_DISPATCH_QUEUE_NAME ?? "cronlet-cloud-dispatch";

  if (!internalToken) {
    throw new Error("CLOUD_INTERNAL_TOKEN is required");
  }

  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    internalToken,
    redisUrl,
    pollIntervalMs,
    queueName,
  };
}
