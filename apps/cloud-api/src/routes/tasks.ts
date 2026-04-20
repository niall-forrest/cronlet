import { taskCreateSchema, taskDispatchSchema, taskPatchSchema } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";

function createdByFromAuth(request: {
  auth: {
    actorType?: string;
    userId: string;
  };
}) {
  if (request.auth.actorType === "agent") {
    return { type: "agent" as const, id: request.auth.userId, name: undefined };
  }

  if (request.auth.actorType === "user") {
    return { type: "user" as const, id: request.auth.userId, name: undefined };
  }

  return undefined;
}

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
      const createdBy = createdByFromAuth(request);
      const created = await app.cloudStore.createTask(request.auth.orgId, input, createdBy);
      return ok(reply, created, 201);
    } catch (error) {
      return handleError(reply, error);
    }
  });

  // Dispatch an on-demand run without creating a visible scheduled task
  app.post("/v1/dispatch", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "member", requiredScope: "runs:write" });
      const input = taskDispatchSchema.parse(request.body);
      const createdBy = createdByFromAuth(request);
      const trigger = request.auth.actorType === "api_key" ? "api" : "manual";
      const run = await app.cloudStore.dispatchTask(request.auth.orgId, input, createdBy, trigger);
      return ok(reply, run, 201);
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

  // Cancel task (durably prevents any new attempts from starting)
  app.post<{ Params: { taskId: string } }>("/v1/tasks/:taskId/cancel", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:write" });
      const result = await app.cloudStore.cancelTask(request.auth.orgId, request.params.taskId);
      return ok(reply, result);
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
