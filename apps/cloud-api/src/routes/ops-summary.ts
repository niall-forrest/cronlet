import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerOpsSummaryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/ops-summary", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:read" });
      const summary = await app.cloudStore.getOpsSummary(request.auth.orgId);
      return ok(reply, summary);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
