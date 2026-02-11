/**
 * Weekly Digest Job
 *
 * Sends a weekly digest email every Friday at 9:00 AM.
 * Demonstrates weekly scheduling with retry configuration.
 */
import { schedule, weekly } from "cronlet";

export default schedule(
  weekly("fri", "09:00").withTimezone("America/New_York"),
  {
    name: "weekly-digest",
    retry: {
      attempts: 3,
      backoff: "exponential",
      initialDelay: "30s",
    },
    timeout: "5m",
  },
  async (ctx) => {
    console.log(`[${ctx.jobName}] Starting weekly digest generation...`);
    console.log(`  Run ID: ${ctx.runId}`);
    console.log(`  Attempt: ${ctx.attempt}`);

    // Simulate digest generation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`[${ctx.jobName}] Weekly digest sent successfully!`);
  }
);
