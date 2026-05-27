import type { FastifyInstance } from "fastify";
import { recordAuditEvent } from "../lib/audit.js";
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

  app.post("/v1/callback-signing-secret/rotate", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:write" });
      const secret = await app.cloudStore.rotateCallbackSigningSecret(request.auth.orgId);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "callback_signing_secret.rotated",
        targetType: "organization",
        targetId: request.auth.orgId,
        metadata: {
          rotatedAt: secret.rotatedAt,
        },
      });

      return ok(reply, secret);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
