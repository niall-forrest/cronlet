import type { ScheduleBuilder } from "../schedule/types.js";
import type { JobConfig, JobHandler, JobDefinition, JobRegistration } from "./types.js";
import { registry } from "./registry.js";

// Counter for generating unique IDs when name not provided
let anonymousCounter = 0;

/**
 * Generate a unique anonymous job ID
 */
function generateAnonymousId(): string {
  return `anonymous-job-${++anonymousCounter}`;
}

/**
 * Create a job definition from a schedule and handler
 */
function createJobDefinition(
  registration: JobRegistration,
  id?: string
): JobDefinition {
  const jobId = id ?? registration.config.name ?? generateAnonymousId();

  return {
    id: jobId,
    name: registration.config.name ?? jobId,
    schedule: registration.schedule,
    config: registration.config,
    handler: registration.handler,
  };
}

/**
 * Schedule a job to run on a specified schedule
 *
 * @param timing - Schedule builder (from every, daily, weekly, monthly, or cron)
 * @param handlerOrConfig - Job handler function or job config
 * @param maybeHandler - Job handler if config was provided as second arg
 * @returns JobDefinition
 *
 * @example
 * ```ts
 * // Simple usage
 * schedule(every("15m"), async (ctx) => {
 *   console.log(`Running ${ctx.jobName}`);
 * });
 *
 * // With configuration
 * schedule(
 *   daily("09:00"),
 *   {
 *     name: "daily-report",
 *     retry: { attempts: 3, backoff: "exponential" },
 *     timeout: "5m",
 *   },
 *   async (ctx) => {
 *     await generateReport();
 *   }
 * );
 * ```
 */
export function schedule(
  timing: ScheduleBuilder,
  handlerOrConfig: JobHandler | JobConfig,
  maybeHandler?: JobHandler
): JobDefinition {
  let config: JobConfig;
  let handler: JobHandler;

  // Determine if second arg is handler or config
  if (typeof handlerOrConfig === "function") {
    // schedule(timing, handler)
    config = {};
    handler = handlerOrConfig;
  } else {
    // schedule(timing, config, handler)
    config = handlerOrConfig;
    if (!maybeHandler) {
      throw new Error(
        "schedule() requires a handler function. When providing config, pass handler as third argument."
      );
    }
    handler = maybeHandler;
  }

  const registration: JobRegistration = {
    schedule: timing,
    config,
    handler,
  };

  const jobDefinition = createJobDefinition(registration);

  // Register the job in the global registry
  registry.register(jobDefinition);

  return jobDefinition;
}

/**
 * Reset the anonymous counter (useful for testing)
 */
export function resetAnonymousCounter(): void {
  anonymousCounter = 0;
}
