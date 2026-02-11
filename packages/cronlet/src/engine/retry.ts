import type { BackoffStrategy, RetryConfig } from "../job/types.js";
import { parseDuration } from "./timeout.js";

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  attempts: 1,
  backoff: "linear",
  initialDelay: "1s",
};

/**
 * Calculate the delay before the next retry attempt
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const initialDelay = config.initialDelay
    ? parseDuration(config.initialDelay)
    : parseDuration(DEFAULT_RETRY_CONFIG.initialDelay);

  const backoff = config.backoff || DEFAULT_RETRY_CONFIG.backoff;

  switch (backoff) {
    case "linear":
      // Linear: delay increases by initialDelay each attempt
      // attempt 1: 1x, attempt 2: 2x, attempt 3: 3x, etc.
      return initialDelay * attempt;

    case "exponential":
      // Exponential: delay doubles each attempt
      // attempt 1: 1x, attempt 2: 2x, attempt 3: 4x, attempt 4: 8x, etc.
      return initialDelay * Math.pow(2, attempt - 1);

    default:
      return initialDelay;
  }
}

/**
 * Check if more retries should be attempted
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Whether to retry
 */
export function shouldRetry(attempt: number, config: RetryConfig): boolean {
  const maxAttempts = config.attempts || DEFAULT_RETRY_CONFIG.attempts;
  return attempt < maxAttempts;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
