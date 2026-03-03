import { scheduleCreateSchema, schedulePatchSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerScheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/schedules", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "schedules:read" });
      return ok(reply, await app.cloudStore.listSchedules(request.auth.orgId));
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.post("/v1/schedules", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "schedules:write" });
      const input = scheduleCreateSchema.parse(request.body);
      const created = await app.cloudStore.createSchedule(request.auth.orgId, input);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  app.patch<{ Params: { scheduleId: string } }>("/v1/schedules/:scheduleId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "schedules:write" });
      const input = schedulePatchSchema.parse(request.body);
      const updated = await app.cloudStore.patchSchedule(request.auth.orgId, request.params.scheduleId, input);
      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
