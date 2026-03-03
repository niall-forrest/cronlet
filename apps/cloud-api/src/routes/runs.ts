import { internalRunStatusSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerRunRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/runs", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "runs:read" });
      return ok(reply, await app.cloudStore.listRuns(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "runs:read" });
      return ok(reply, await app.cloudStore.getRun(request.auth.orgId, request.params.runId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{ Params: { runId: string } }>("/internal/runs/:runId/status", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const input = internalRunStatusSchema.parse(request.body);
      const run = await app.cloudStore.updateRunStatus(
        request.params.runId,
        input.status,
        input.attempt,
        input.durationMs,
        input.errorMessage
      );
      return ok(reply, run);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
