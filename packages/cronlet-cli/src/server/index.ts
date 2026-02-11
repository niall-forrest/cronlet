import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { registry, engine, type ExecutionResult } from "cronlet";
import type { CronScheduler } from "../scheduler/index.js";
import { setupSSE, type SSEClient } from "./sse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Execution history entry
 */
interface HistoryEntry extends ExecutionResult {
  jobName: string;
}

/**
 * Job status
 */
type JobStatus = "idle" | "running" | "failed" | "success";

/**
 * Server state
 */
interface ServerState {
  scheduler: CronScheduler;
  history: Map<string, HistoryEntry[]>;
  runningJobs: Set<string>;
  sseClients: Set<SSEClient>;
}

const MAX_HISTORY_PER_JOB = 50;

/**
 * Create the HTTP server for the dashboard
 */
export async function createServer(scheduler: CronScheduler, port: number) {
  const fastify = Fastify({ logger: false });

  const state: ServerState = {
    scheduler,
    history: new Map(),
    runningJobs: new Set(),
    sseClients: new Set(),
  };

  // Subscribe to execution events
  engine.on("*", (event) => {
    // Broadcast to all SSE clients
    for (const client of state.sseClients) {
      client.send(event);
    }

    // Update running state
    if (event.type === "job:start") {
      state.runningJobs.add(event.jobId);
    } else if (
      event.type === "job:success" ||
      event.type === "job:failure" ||
      event.type === "job:timeout"
    ) {
      state.runningJobs.delete(event.jobId);

      // Add to history
      const job = registry.getById(event.jobId);
      if (job) {
        const entry: HistoryEntry = {
          jobId: event.jobId,
          jobName: job.name,
          runId: event.runId,
          status: event.type === "job:success" ? "success" : event.type === "job:timeout" ? "timeout" : "failure",
          startedAt: event.timestamp,
          completedAt: event.timestamp,
          duration: event.duration ?? 0,
          attempt: event.attempt,
          error: event.error,
        };

        if (!state.history.has(event.jobId)) {
          state.history.set(event.jobId, []);
        }

        const jobHistory = state.history.get(event.jobId)!;
        jobHistory.unshift(entry);

        // Trim history
        if (jobHistory.length > MAX_HISTORY_PER_JOB) {
          jobHistory.pop();
        }
      }
    }
  });

  // CORS headers for dashboard
  fastify.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  });

  // Handle preflight
  fastify.options("*", async (_request, reply) => {
    reply.status(204).send();
  });

  // GET /api/jobs - List all jobs
  fastify.get("/api/jobs", async () => {
    const jobs = registry.getAll();

    return jobs.map((job) => {
      const history = state.history.get(job.id) ?? [];
      const lastRun = history[0];
      const nextRun = state.scheduler.getNextRun(job.id);

      let status: JobStatus = "idle";
      if (state.runningJobs.has(job.id)) {
        status = "running";
      } else if (lastRun) {
        status = lastRun.status === "success" ? "success" : "failed";
      }

      return {
        id: job.id,
        name: job.name,
        schedule: job.schedule.humanReadable,
        cron: job.schedule.cron,
        timezone: job.schedule.timezone,
        status,
        lastRun: lastRun
          ? {
              runId: lastRun.runId,
              status: lastRun.status,
              duration: lastRun.duration,
              completedAt: lastRun.completedAt,
            }
          : null,
        nextRun: nextRun?.toISOString() ?? null,
      };
    });
  });

  // GET /api/jobs/:id - Get single job
  fastify.get<{ Params: { id: string } }>("/api/jobs/:id", async (request, reply) => {
    const job = registry.getById(request.params.id);

    if (!job) {
      reply.status(404);
      return { error: "Job not found" };
    }

    const history = state.history.get(job.id) ?? [];
    const nextRun = state.scheduler.getNextRun(job.id);

    let status: JobStatus = "idle";
    if (state.runningJobs.has(job.id)) {
      status = "running";
    } else if (history[0]) {
      status = history[0].status === "success" ? "success" : "failed";
    }

    return {
      id: job.id,
      name: job.name,
      schedule: job.schedule.humanReadable,
      cron: job.schedule.cron,
      timezone: job.schedule.timezone,
      config: {
        retry: job.config.retry,
        timeout: job.config.timeout,
      },
      status,
      nextRun: nextRun?.toISOString() ?? null,
    };
  });

  // GET /api/jobs/:id/runs - Get job execution history
  fastify.get<{ Params: { id: string } }>("/api/jobs/:id/runs", async (request, reply) => {
    const job = registry.getById(request.params.id);

    if (!job) {
      reply.status(404);
      return { error: "Job not found" };
    }

    const history = state.history.get(job.id) ?? [];

    return history.map((entry) => ({
      runId: entry.runId,
      status: entry.status,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      duration: entry.duration,
      attempt: entry.attempt,
      error: entry.error,
    }));
  });

  // POST /api/jobs/:id/trigger - Manually trigger a job
  fastify.post<{ Params: { id: string } }>("/api/jobs/:id/trigger", async (request, reply) => {
    const job = registry.getById(request.params.id);

    if (!job) {
      reply.status(404);
      return { error: "Job not found" };
    }

    // Run job in background
    state.scheduler.executeJob(job).catch(() => {
      // Error handling is done via events
    });

    return { message: "Job triggered", jobId: job.id };
  });

  // SSE endpoint for real-time updates
  setupSSE(fastify, state.sseClients);

  // Serve dashboard static files
  // Look for dashboard in node_modules (workspace linked) or relative path
  // __dirname is packages/cronlet-cli/dist, so we need to go up 3 levels to repo root
  const possibleDashboardPaths = [
    join(__dirname, "../../../apps/dashboard/dist"),
    join(__dirname, "../../node_modules/@cronlet/dashboard/dist"),
    join(process.cwd(), "node_modules/@cronlet/dashboard/dist"),
  ];

  const dashboardPath = possibleDashboardPaths.find((p) => existsSync(p));

  if (dashboardPath) {
    await fastify.register(fastifyStatic, {
      root: dashboardPath,
      prefix: "/",
    });

    // SPA fallback - serve index.html for non-API routes
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.status(404).send({ error: "Not found" });
      } else {
        return reply.sendFile("index.html");
      }
    });
  }

  // Start server
  await fastify.listen({ port, host: "0.0.0.0" });

  return fastify;
}
