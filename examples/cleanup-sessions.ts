/**
 * Session Cleanup Job
 *
 * Cleans up expired sessions every 6 hours.
 * Demonstrates interval-based scheduling.
 */
import { schedule, every } from "cronlet";

export default schedule(every("6h"), { name: "cleanup-sessions" }, async (ctx) => {
  console.log(`[${ctx.jobName}] Cleaning up expired sessions...`);
  console.log(`  Started at: ${ctx.startedAt.toISOString()}`);

  // Simulate cleanup work
  const expiredCount = Math.floor(Math.random() * 100);
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log(`[${ctx.jobName}] Cleaned up ${expiredCount} expired sessions`);
});
