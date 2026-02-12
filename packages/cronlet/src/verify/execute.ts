import type { JobDefinition } from "../job/types.js";
import type { ExecutionResult } from "../engine/types.js";
import { ExecutionEngine } from "../engine/executor.js";

/**
 * Execute a job in a serverless context.
 *
 * This is a convenience wrapper around ExecutionEngine for use in
 * generated Vercel/Cloudflare route handlers. It handles:
 * - Retries with configured backoff
 * - Timeouts via AbortController
 * - onSuccess/onFailure callbacks
 *
 * @param job - The job definition to execute
 * @returns Execution result with status, duration, and any error info
 *
 * @example
 * ```ts
 * // In a generated API route
 * const result = await executeJob(job);
 * if (result.status === "success") {
 *   return new Response("OK", { status: 200 });
 * }
 * return new Response(result.error?.message, { status: 500 });
 * ```
 */
export async function executeJob(job: JobDefinition): Promise<ExecutionResult> {
  const engine = new ExecutionEngine();
  return engine.run(job);
}
