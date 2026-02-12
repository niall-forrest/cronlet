import type { JobDefinition } from "cronlet";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
}

/**
 * Parse a duration string (e.g., "30s", "5m", "1h") to milliseconds
 */
function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 0;

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
}

/**
 * Calculate the maximum potential execution time including retries
 */
function calculateMaxExecutionTime(job: JobDefinition): number {
  const attempts = job.config.retry?.attempts ?? 1;
  const backoff = job.config.retry?.backoff ?? "linear";
  const initialDelay = parseDurationMs(job.config.retry?.initialDelay ?? "1s");
  const jobTimeout = parseDurationMs(job.config.timeout ?? "30s");

  // Total time = (all attempts * timeout) + (all delays between attempts)
  let totalTime = attempts * jobTimeout;

  // Add backoff delays between attempts
  for (let i = 1; i < attempts; i++) {
    if (backoff === "exponential") {
      totalTime += initialDelay * Math.pow(2, i - 1);
    } else {
      // Linear
      totalTime += initialDelay * i;
    }
  }

  return totalTime;
}

/**
 * Validate a job for Vercel deployment
 */
export function validateForVercel(
  job: JobDefinition,
  maxFunctionDuration: number = 60000 // 60 seconds default
): ValidationResult {
  const warnings: string[] = [];
  const cron = job.schedule.cron;
  const fields = cron.trim().split(/\s+/);

  // Check for 6-field cron (has seconds)
  if (fields.length === 6) {
    return {
      valid: false,
      error: `Job '${job.id}' uses seconds precision in cron expression (${cron}). Vercel only supports 5-field cron (minute precision).`,
      warnings,
    };
  }

  // Check for sub-minute intervals
  if (job.schedule.type === "interval") {
    const params = job.schedule.originalParams as { interval?: string };
    if (params.interval) {
      const match = params.interval.match(/^(\d+)(s|m|h|d|w)$/);
      if (match) {
        const value = parseInt(match[1]!, 10);
        const unit = match[2]!;

        if (unit === "s") {
          return {
            valid: false,
            error: `Job '${job.id}' uses ${params.interval} interval. Vercel requires minimum 1 minute intervals.`,
            warnings,
          };
        }

        if (unit === "m" && value < 1) {
          return {
            valid: false,
            error: `Job '${job.id}' uses sub-minute interval. Vercel requires minimum 1 minute intervals.`,
            warnings,
          };
        }
      }
    }
  }

  // Check timezone
  if (job.schedule.timezone) {
    warnings.push(
      `Job '${job.id}' uses timezone '${job.schedule.timezone}'. ` +
        `Vercel cron runs in UTC. Adjust your schedule accordingly.`
    );
  }

  // Check retry config doesn't exceed function timeout
  if (job.config.retry && job.config.retry.attempts > 1) {
    const maxTime = calculateMaxExecutionTime(job);

    if (maxTime > maxFunctionDuration) {
      const maxTimeSec = Math.round(maxTime / 1000);
      const maxFunctionSec = Math.round(maxFunctionDuration / 1000);

      warnings.push(
        `Job '${job.id}' retry config could take up to ${maxTimeSec}s, ` +
          `exceeding the ${maxFunctionSec}s function timeout. ` +
          `Consider reducing retry attempts or delay.`
      );
    }
  }

  // Check for "L" suffix in monthly schedules (last weekday of month)
  if (cron.includes("L")) {
    warnings.push(
      `Job '${job.id}' uses "L" suffix for last occurrence. ` +
        `Verify Vercel supports this cron syntax.`
    );
  }

  return {
    valid: true,
    warnings,
  };
}

/**
 * Flatten a job ID for URL usage
 * billing/sync-stripe -> billing-sync-stripe
 */
export function flattenJobId(jobId: string): string {
  return jobId.replace(/\//g, "-");
}
