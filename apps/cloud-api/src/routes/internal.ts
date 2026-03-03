import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string } }>("/internal/schedules/due", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:schedules:read" });
      const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 100;
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
      const dispatches = await app.cloudStore.claimDueDispatches(safeLimit);
      return ok(reply, dispatches);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
