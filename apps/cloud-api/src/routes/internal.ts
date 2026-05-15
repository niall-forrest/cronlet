import { internalDispatchCompleteSchema, internalDispatchStartSchema, retentionCleanupQuerySchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  // Claim due tasks for execution
  app.get<{ Querystring: { limit?: string } }>("/internal/tasks/due", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:tasks:read" });
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 100;
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
      const dispatches = await app.cloudStore.claimDueDispatches(safeLimit);
      return ok(reply, dispatches);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/internal/dispatch/start", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const input = internalDispatchStartSchema.parse(request.body);
      await app.cloudStore.startDispatchAttempt(input);
      return ok(reply, { started: true });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/internal/dispatch/complete", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const input = internalDispatchCompleteSchema.parse(request.body);
      await app.cloudStore.completeDispatchAttempt(input);
      return ok(reply, { completed: true });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{ Querystring: { limit?: string } }>("/internal/dispatch/reconcile", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 100;
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
      const result = await app.cloudStore.reconcileDispatches(safeLimit);
      return ok(reply, result);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/internal/retention/cleanup", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:runs:write" });
      const query = retentionCleanupQuerySchema.parse(request.query ?? {});
      const result = await app.cloudStore.cleanupRetention(query.limit);
      return ok(reply, result);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Note: /internal/secrets/:name is registered in secrets.ts
}
