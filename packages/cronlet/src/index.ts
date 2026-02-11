/**
 * Cronlet - The simplest way to add scheduled tasks to your Next.js app
 *
 * @example
 * ```ts
 * import { schedule, every, daily, weekly } from "cronlet"
 *
 * // Run every 15 minutes
 * export default schedule(every("15m"), async (ctx) => {
 *   console.log(`Running ${ctx.jobName}`)
 * })
 *
 * // Run daily at 9 AM
 * export default schedule(daily("09:00"), async (ctx) => {
 *   await sendDailyReport()
 * })
 *
 * // Run every Friday at 5 PM with retry
 * export default schedule(
 *   weekly("fri", "17:00"),
 *   { retry: { attempts: 3, backoff: "exponential" } },
 *   async (ctx) => {
 *     await generateWeeklyDigest()
 *   }
 * )
 * ```
 */

// Schedule builders
export { every } from "./schedule/every.js";
export { daily } from "./schedule/daily.js";
export { weekly } from "./schedule/weekly.js";
export { monthly } from "./schedule/monthly.js";
export { cron } from "./schedule/cron.js";

// Schedule types
export type {
  IntervalUnit,
  IntervalString,
  TimeString,
  DayOfWeek,
  MonthlyDay,
  ScheduleType,
  ScheduleDescriptor,
  ScheduleBuilder,
} from "./schedule/types.js";

// Job functions and types
export { schedule, resetAnonymousCounter } from "./job/schedule.js";
export { registry, JobRegistry } from "./job/registry.js";
export { discoverJobs, getDefaultDirectories } from "./job/discover.js";
export type {
  JobContext,
  JobHandler,
  BackoffStrategy,
  RetryConfig,
  JobConfig,
  JobDefinition,
  DiscoverOptions,
} from "./job/index.js";

// Execution engine
export { ExecutionEngine, engine } from "./engine/executor.js";
export { parseDuration, TimeoutError, isTimeoutError } from "./engine/timeout.js";
export type {
  ExecutionStatus,
  ExecutionError,
  ExecutionResult,
  ExecutionEventType,
  ExecutionEvent,
  ExecutionEventListener,
} from "./engine/types.js";
