export interface WorkerConfig {
  apiBaseUrl: string;
  internalToken: string;
  redisUrl: string;
  pollIntervalMs: number;
  queueName: string;
}

export function readConfig(): WorkerConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const apiBaseUrl = process.env.CLOUD_API_BASE_URL ?? (isProduction ? undefined : "http://127.0.0.1:4050");
  const internalToken = process.env.CLOUD_INTERNAL_TOKEN ?? (isProduction ? undefined : "dev-internal-token");
  const redisUrl = process.env.REDIS_URL ?? (isProduction ? undefined : "redis://127.0.0.1:6379");
  const pollIntervalMs = Number.parseInt(process.env.CLOUD_POLL_INTERVAL_MS ?? "15000", 10);
  const queueName = process.env.CLOUD_DISPATCH_QUEUE_NAME ?? "cronlet-cloud-dispatch";

  if (!apiBaseUrl) {
    throw new Error("CLOUD_API_BASE_URL is required in production");
  }

  if (!internalToken) {
    throw new Error("CLOUD_INTERNAL_TOKEN is required in production");
  }

  if (!redisUrl) {
    throw new Error("REDIS_URL is required in production");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    internalToken,
    redisUrl,
    pollIntervalMs,
    queueName,
  };
}
