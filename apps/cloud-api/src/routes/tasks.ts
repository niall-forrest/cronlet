import { taskCreateSchema, taskPatchSchema } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  // List tasks
  app.get("/v1/tasks", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "tasks:read" });
      const tasks = await app.cloudStore.listTasks(request.auth.orgId);
      return ok(reply, tasks);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Get single task
  app.get<{ Params: { taskId: string } }>("/v1/tasks/:taskId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "viewer", requiredScope: "tasks:read" });
      const task = await app.cloudStore.getTask(request.auth.orgId, request.params.taskId);
      return ok(reply, task);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Create task
  app.post("/v1/tasks", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:write" });
      const input = taskCreateSchema.parse(request.body);

      // Build createdBy from auth context
      const createdBy = request.auth.actorType === "agent"
        ? { type: "agent" as const, id: request.auth.userId, name: undefined }
        : { type: "user" as const, id: request.auth.userId, name: undefined };

      const created = await app.cloudStore.createTask(request.auth.orgId, input, createdBy);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Update task
  app.patch<{ Params: { taskId: string } }>("/v1/tasks/:taskId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:write" });
      const input = taskPatchSchema.parse(request.body);
      const updated = await app.cloudStore.patchTask(request.auth.orgId, request.params.taskId, input);
      return ok(reply, updated);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Delete task
  app.delete<{ Params: { taskId: string } }>("/v1/tasks/:taskId", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:write" });
      await app.cloudStore.deleteTask(request.auth.orgId, request.params.taskId);
      return ok(reply, { deleted: true });
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Trigger task (immediate run)
  app.post<{ Params: { taskId: string } }>("/v1/tasks/:taskId/trigger", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const trigger = request.auth.actorType === "api_key" ? "api" : "manual";
      const run = await app.cloudStore.triggerTask(request.auth.orgId, request.params.taskId, trigger);
      return ok(reply, run, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
