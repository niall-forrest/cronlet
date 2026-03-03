import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerUsageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/usage", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "usage:read" });
      return ok(reply, await app.cloudStore.getUsage(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
