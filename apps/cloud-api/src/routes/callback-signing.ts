import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerCallbackSigningRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/callback-signing-secret", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:read" });
      const secret = await app.cloudStore.getCallbackSigningSecret(request.auth.orgId);
      return ok(reply, secret);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
