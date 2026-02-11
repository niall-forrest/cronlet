/**
 * Stripe Sync Job
 *
 * Syncs payment data from Stripe every day at midnight.
 * Demonstrates daily scheduling with error handling callbacks.
 */
import { schedule, daily } from "cronlet";

export default schedule(
  daily("00:00"),
  {
    name: "sync-stripe",
    retry: {
      attempts: 5,
      backoff: "exponential",
      initialDelay: "1m",
    },
    timeout: "10m",
    onSuccess: async (ctx) => {
      console.log(`[${ctx.jobName}] ✓ Stripe sync completed after ${ctx.attempt} attempt(s)`);
    },
    onFailure: async (error, ctx) => {
      console.error(`[${ctx.jobName}] ✗ Stripe sync failed after ${ctx.attempt} attempts`);
      console.error(`  Error: ${error.message}`);
      // In a real app, you might send an alert here
    },
  },
  async (ctx) => {
    console.log(`[${ctx.jobName}] Starting Stripe data sync...`);

    // Simulate API calls to Stripe
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Simulate processing
    const customersProcessed = Math.floor(Math.random() * 50) + 10;
    const invoicesProcessed = Math.floor(Math.random() * 200) + 50;

    console.log(`[${ctx.jobName}] Synced ${customersProcessed} customers`);
    console.log(`[${ctx.jobName}] Synced ${invoicesProcessed} invoices`);
  }
);
