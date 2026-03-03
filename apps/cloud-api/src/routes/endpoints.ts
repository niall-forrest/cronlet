import { endpointCreateSchema, endpointPatchSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerEndpointRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/endpoints", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "endpoints:read" });
      return ok(reply, await app.cloudStore.listEndpoints(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/endpoints", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "endpoints:write" });
      const input = endpointCreateSchema.parse(request.body);
      const created = await app.cloudStore.createEndpoint(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.patch<{ Params: { endpointId: string } }>("/v1/endpoints/:endpointId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "endpoints:write" });
      const input = endpointPatchSchema.parse(request.body);
      const updated = await app.cloudStore.patchEndpoint(request.auth.orgId, request.params.endpointId, input);
      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
