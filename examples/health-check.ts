/**
 * Health Check Job
 *
 * Runs a simple health check every 5 minutes.
 * Demonstrates simple interval scheduling with minimal config.
 */
import { schedule, every } from "cronlet";

export default schedule(every("5m"), { name: "health-check" }, async (ctx) => {
  const startTime = Date.now();

  // Check various services
  const checks = {
    database: await checkDatabase(),
    cache: await checkCache(),
    api: await checkExternalAPI(),
  };

  const allHealthy = Object.values(checks).every((c) => c.healthy);
  const duration = Date.now() - startTime;

  if (allHealthy) {
    console.log(`[${ctx.jobName}] ✓ All systems healthy (${duration}ms)`);
  } else {
    const unhealthy = Object.entries(checks)
      .filter(([_, c]) => !c.healthy)
      .map(([name]) => name);
    console.warn(`[${ctx.jobName}] ⚠ Unhealthy: ${unhealthy.join(", ")}`);
  }
});

// Simulated health check functions
async function checkDatabase(): Promise<{ healthy: boolean; latency: number }> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { healthy: true, latency: 45 };
}

async function checkCache(): Promise<{ healthy: boolean; latency: number }> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { healthy: true, latency: 15 };
}

async function checkExternalAPI(): Promise<{ healthy: boolean; latency: number }> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { healthy: Math.random() > 0.1, latency: 95 }; // 90% healthy
}
