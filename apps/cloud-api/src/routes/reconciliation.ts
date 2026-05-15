import { reconciliationCompareSchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerReconciliationRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/reconciliation/compare", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "tasks:read" });
      const input = reconciliationCompareSchema.parse(request.body);
      const result = await app.cloudStore.compareReconciliation(request.auth.orgId, input);
      return ok(reply, result);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
