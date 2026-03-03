import { projectCreateSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/projects", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "projects:read" });
      return ok(reply, await app.cloudStore.listProjects(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/projects", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "projects:write" });
      const input = projectCreateSchema.parse(request.body);
      const created = await app.cloudStore.createProject(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
