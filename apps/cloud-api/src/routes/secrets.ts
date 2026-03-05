import { secretCreateSchema, secretPatchSchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerSecretRoutes(app: FastifyInstance): Promise<void> {
  // List secrets (returns names only, not values)
  app.get("/v1/secrets", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:read" });
      const secrets = await app.cloudStore.listSecrets(request.auth.orgId);
      return ok(reply, secrets);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Create secret
  app.post("/v1/secrets", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:write" });
      const input = secretCreateSchema.parse(request.body);
      const created = await app.cloudStore.createSecret(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Update secret
  app.patch<{ Params: { name: string } }>("/v1/secrets/:name", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:write" });
      const input = secretPatchSchema.parse(request.body);
      const updated = await app.cloudStore.patchSecret(request.auth.orgId, request.params.name, input);
      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Delete secret
  app.delete<{ Params: { name: string } }>("/v1/secrets/:name", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "secrets:write" });
      await app.cloudStore.deleteSecret(request.auth.orgId, request.params.name);
      return ok(reply, { deleted: true });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Internal: Get secret value (used by worker)
  app.get<{ Params: { name: string } }>("/internal/secrets/:name", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "owner", requiredScope: "internal:secrets:read" });
      const value = await app.cloudStore.getSecretValue(request.auth.orgId, request.params.name);
      return ok(reply, { value });
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
