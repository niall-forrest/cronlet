import { apiKeyCreateSchema, apiKeyRotateSchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { recordAuditEvent } from "../lib/audit.js";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/api-keys", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "api_keys:read" });
      const keys = await app.cloudStore.listApiKeys(request.auth.orgId);
      return ok(reply, keys);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/api-keys", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "api_keys:write" });
      const input = apiKeyCreateSchema.parse(request.body);
      const created = await app.cloudStore.createApiKey(request.auth.orgId, input);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "api_key.created",
        targetType: "api_key",
        targetId: created.apiKey.id,
        metadata: {
          label: created.apiKey.label,
          scopes: created.apiKey.scopes,
        },
      });

      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{ Params: { apiKeyId: string } }>("/v1/api-keys/:apiKeyId/rotate", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "api_keys:write" });
      const input = apiKeyRotateSchema.parse(request.body);
      const rotated = await app.cloudStore.rotateApiKey(request.auth.orgId, request.params.apiKeyId, input);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "api_key.rotated",
        targetType: "api_key",
        targetId: rotated.apiKey.id,
        metadata: {
          label: rotated.apiKey.label,
          scopes: rotated.apiKey.scopes,
        },
      });

      return ok(reply, rotated);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.delete<{ Params: { apiKeyId: string } }>("/v1/api-keys/:apiKeyId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "api_keys:write" });
      await app.cloudStore.revokeApiKey(request.auth.orgId, request.params.apiKeyId);

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "api_key.revoked",
        targetType: "api_key",
        targetId: request.params.apiKeyId,
      });

      return ok(reply, { revoked: true });
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
