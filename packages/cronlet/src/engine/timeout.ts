/**
 * Parse a duration string into milliseconds
 * Supports: "100ms", "30s", "5m", "1h", "1d"
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format: number + unit (ms/s/m/h/d). Examples: "100ms", "30s", "5m", "1h"`
    );
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

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
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Create a promise that rejects after a timeout
 */
export function createTimeoutPromise(ms: number): {
  promise: Promise<never>;
  clear: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Execution timed out after ${ms}ms`));
    }, ms);
  });

  return {
    promise,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Custom error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}
