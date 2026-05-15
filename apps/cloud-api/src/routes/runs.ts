import { bulkRunReplaySchema, internalRunStatusSchema, runListQuerySchema, timelineQuerySchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { recordAuditEvent } from "../lib/audit.js";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  // List runs (optionally filtered by task)
  app.get("/v1/runs", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "runs:read" });
      const query = runListQuerySchema.parse(request.query);
      const runs = await app.cloudStore.listRuns(request.auth.orgId, query);
      return ok(reply, runs);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Get single run
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "runs:read" });
      const run = await app.cloudStore.getRun(request.auth.orgId, request.params.runId);
      return ok(reply, run);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/timeline", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "runs:read" });
      const query = timelineQuerySchema.parse(request.query);
      const timeline = await app.cloudStore.getRunTimeline(request.auth.orgId, request.params.runId, query.limit);
      return ok(reply, timeline);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{ Params: { runId: string } }>("/v1/runs/:runId/replay", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const trigger = request.auth.actorType === "api_key" ? "api" : "manual";
      const result = await app.cloudStore.replayRun(request.auth.orgId, request.params.runId, trigger);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "run.replayed",
        targetType: "run",
        targetId: result.run.id,
        metadata: {
          replayOfRunId: result.replayOfRunId,
          trigger,
        },
      });

      return ok(reply, result, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/runs/bulk-replay", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const input = bulkRunReplaySchema.parse(request.body);
      const trigger = request.auth.actorType === "api_key" ? "api" : "manual";
      const result = await app.cloudStore.bulkReplayRuns(request.auth.orgId, input, trigger);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "run.bulk_replayed",
        targetType: "run_batch",
        targetId: request.auth.orgId,
        payload: input,
        metadata: {
          count: result.count,
          runIds: result.results.map((entry) => entry.run.id),
          replayOfRunIds: result.results.map((entry) => entry.replayOfRunId),
          trigger,
        },
      });

      return ok(reply, result, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Internal: Update run status (used by worker)
  app.post<{ Params: { runId: string } }>("/internal/runs/:runId/status", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const input = internalRunStatusSchema.parse(request.body);
      const run = await app.cloudStore.updateRunStatus(request.params.runId, input);
      return ok(reply, run);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
