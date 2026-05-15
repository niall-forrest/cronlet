import { circuitBreakerListQuerySchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerCircuitBreakerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/circuit-breakers", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "tasks:read" });
      const filters = circuitBreakerListQuerySchema.parse(request.query ?? {});
      const breakers = await app.cloudStore.listCircuitBreakers(request.auth.orgId, filters);
      return ok(reply, breakers);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
