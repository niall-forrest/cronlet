import type { FastifyInstance } from "fastify";
import { ERROR_CODES } from "@cronlet/shared";
import { recordAuditEvent } from "../lib/audit.js";
import { seedDemoDataForOrganization } from "../lib/demo-seed.js";
import { AppError } from "../lib/errors.js";
import { handleError, ok } from "../lib/http.js";
import { authorize } from "../lib/permissions.js";
import { InMemoryCloudStore } from "../lib/store.js";

export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/demo/seed", async (request, reply) => {
    try {
      authorize(request.auth, { minimumRole: "admin", requiredScope: "tasks:write" });

      if (process.env.NODE_ENV === "production") {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Demo seed is not available in production");
      }

      const result = app.prisma
        ? await seedDemoDataForOrganization(app.prisma, {
          organizationId: request.auth.orgId,
          userId: request.auth.userId,
        })
        : app.cloudStore instanceof InMemoryCloudStore
          ? app.cloudStore.seedDemoData(request.auth.orgId, request.auth.userId)
          : (() => {
            throw new AppError(501, ERROR_CODES.VALIDATION_ERROR, "Demo seed is not supported by this store mode");
          })();

      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: request.auth.actorType ?? "user",
        actorId: request.auth.userId,
        action: "demo.seeded",
        targetType: "organization",
        targetId: request.auth.orgId,
        metadata: {
          taskCount: result.taskCount,
          runCount: result.runCount,
          seededAt: result.seededAt,
        },
      });

      return ok(reply, result);
    } catch (error) {
      return handleError(reply, error);
    }
  });
}
