import { auditEventListSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { authorize } from "../lib/permissions.js";
import { handleError, ok } from "../lib/http.js";

export async function registerAuditEventRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/audit-events", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "audit:read" });
      const filters = auditEventListSchema.parse(request.query ?? {});
      const events = await app.cloudStore.listAuditEvents(request.auth.orgId, filters);
      return ok(reply, events);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
