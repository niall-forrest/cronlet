import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerOrgStatusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/org-status", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "tasks:read" });
      const hasApiKeys = await app.cloudStore.hasApiKeys(request.auth.orgId);
      return ok(reply, { hasApiKeys });
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
