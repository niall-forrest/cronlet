import { jobCreateSchema, jobPatchSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerJobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/jobs", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "jobs:read" });
      return ok(reply, await app.cloudStore.listJobs(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/jobs", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "jobs:write" });
      const input = jobCreateSchema.parse(request.body);
      const created = await app.cloudStore.createJob(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.patch<{ Params: { jobId: string } }>("/v1/jobs/:jobId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "jobs:write" });
      const input = jobPatchSchema.parse(request.body);
      const updated = await app.cloudStore.patchJob(request.auth.orgId, request.params.jobId, input);
      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post<{ Params: { jobId: string } }>("/v1/jobs/:jobId/trigger", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const run = await app.cloudStore.triggerJob(request.auth.orgId, request.params.jobId, "manual", null);
      return ok(reply, run, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
