import { outboundPolicyPatchSchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { recordAuditEvent } from "../lib/audit.js";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerOutboundPolicyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/outbound-policy", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:read" });
      const policy = await app.cloudStore.getOutboundPolicy(request.auth.orgId);
      return ok(reply, policy);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.patch("/v1/outbound-policy", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:write" });
      const input = outboundPolicyPatchSchema.parse(request.body);
      const updated = await app.cloudStore.updateOutboundPolicy(request.auth.orgId, input);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "outbound_policy.updated",
        targetType: "organization",
        targetId: request.auth.orgId,
        metadata: {
          allowedHosts: updated.allowedHosts,
        },
      });

      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
