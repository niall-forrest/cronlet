import { bulkRunReplaySchema, internalRunStatusSchema, runListQuerySchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
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

  app.post<{ Params: { runId: string } }>("/v1/runs/:runId/replay", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const trigger = request.auth.actorType === "api_key" ? "api" : "manual";
      const result = await app.cloudStore.replayRun(request.auth.orgId, request.params.runId, trigger);
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
