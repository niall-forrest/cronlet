import Fastify from "fastify";
import { CloudClient } from "@cronlet/cloud-sdk";
import { MCP_TOOLS, type McpToolName } from "./lib/tools.js";

const port = Number.parseInt(process.env.PORT ?? "4060", 10);
const host = process.env.HOST ?? "0.0.0.0";
const apiBaseUrl = process.env.CLOUD_API_BASE_URL ?? "http://127.0.0.1:4050";
const apiKey = process.env.CLOUD_API_KEY ?? "dev-token";
const enableWrites = process.env.CLOUD_MCP_ENABLE_WRITES === "true";

const client = new CloudClient({
  baseUrl: apiBaseUrl,
  apiKey,
});

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, service: "cloud-mcp", enableWrites }));

app.get("/tools", async () => ({
  ok: true,
  data: MCP_TOOLS.map((tool) => ({
    ...tool,
    enabled: tool.mutating ? enableWrites : true,
  })),
}));

app.post<{ Params: { tool: McpToolName }; Body: Record<string, unknown> }>("/tools/:tool", async (request, reply) => {
  const tool = MCP_TOOLS.find((item) => item.name === request.params.tool);
  if (!tool) {
    reply.status(404);
    return { ok: false, error: { message: "Tool not found" } };
  }

  if (tool.mutating && !enableWrites) {
    reply.status(403);
    return {
      ok: false,
      error: {
        message: "MCP mutating tools are disabled by policy",
      },
    };
  }

  try {
    switch (tool.name) {
      case "list_projects": {
        const data = await client.projects.list();
        return { ok: true, data };
      }
      case "list_jobs": {
        const data = await client.jobs.list();
        return { ok: true, data };
      }
      case "list_runs": {
        const data = await client.runs.list();
        return { ok: true, data };
      }
      case "trigger_job": {
        const jobId = String(request.body.jobId ?? "").trim();
        if (!jobId) {
          reply.status(400);
          return { ok: false, error: { message: "jobId is required" } };
        }
        const data = await client.jobs.trigger(jobId);
        return { ok: true, data };
      }
      case "pause_schedule": {
        const scheduleId = String(request.body.scheduleId ?? "").trim();
        if (!scheduleId) {
          reply.status(400);
          return { ok: false, error: { message: "scheduleId is required" } };
        }
        const data = await client.schedules.patch(scheduleId, { active: false });
        return { ok: true, data };
      }
      case "update_schedule": {
        const scheduleId = String(request.body.scheduleId ?? "").trim();
        if (!scheduleId) {
          reply.status(400);
          return { ok: false, error: { message: "scheduleId is required" } };
        }

        const data = await client.schedules.patch(scheduleId, {
          active: request.body.active as boolean | undefined,
          cron: request.body.cron as string | undefined,
          timezone: request.body.timezone as string | undefined,
        });

        return { ok: true, data };
      }
      case "get_failure_summary": {
        const runs = await client.runs.list();
        const failures = runs.filter((run) => run.status === "failure" || run.status === "timeout");
        const byJob = failures.reduce<Record<string, number>>((acc, run) => {
          acc[run.jobId] = (acc[run.jobId] ?? 0) + 1;
          return acc;
        }, {});

        return {
          ok: true,
          data: {
            totalFailures: failures.length,
            byJob,
          },
        };
      }
      default:
        reply.status(400);
        return { ok: false, error: { message: "Unsupported tool" } };
    }
  } catch (error) {
    reply.status(500);
    return {
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
});

await app.listen({ port, host });
