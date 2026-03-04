import { auditEventCreateSchema, auditEventListSchema } from "@cronlet/cloud-shared";
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

  app.post("/v1/audit-events", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "audit:write" });
      const input = auditEventCreateSchema.parse(request.body);
      await app.cloudStore.createAuditEvent({
        organizationId: request.auth.orgId,
        actorType: input.actorType ?? request.auth.actorType ?? "user",
        actorId: input.actorId ?? request.auth.userId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payloadHash: input.payloadHash ?? null,
        metadata: input.metadata ?? null,
      });
      return ok(reply, { recorded: true }, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
