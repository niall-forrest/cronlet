import { alertCreateSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/alerts", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "alerts:read" });
      return ok(reply, await app.cloudStore.listAlerts(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/alerts", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "alerts:write" });
      const input = alertCreateSchema.parse(request.body);
      const created = await app.cloudStore.createAlert(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
