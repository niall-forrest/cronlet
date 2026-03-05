import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("Cloud API authorization", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("blocks viewer role from task CRUD while allowing owner/admin", async () => {
    const app = await buildServer();
    try {
      // Viewer cannot create tasks
      const viewerTaskCreate = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "viewer_1",
          "x-role": "viewer",
        },
        payload: {
          name: "Viewer Task",
          handler: {
            type: "webhook",
            url: "https://example.com/cronlet",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
          timezone: "UTC",
        },
      });
      expect(viewerTaskCreate.statusCode).toBe(403);
      expect(viewerTaskCreate.json().error.code).toBe("FORBIDDEN");

      // Admin can create tasks
      const adminTaskCreate = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "admin_1",
          "x-role": "admin",
        },
        payload: {
          name: "Admin Task",
          handler: {
            type: "webhook",
            url: "https://example.com/cronlet",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
          timezone: "UTC",
        },
      });
      expect(adminTaskCreate.statusCode).toBe(201);
      const taskId = adminTaskCreate.json().data.id as string;

      // Viewer cannot delete tasks
      const viewerTaskDelete = await app.inject({
        method: "DELETE",
        url: `/v1/tasks/${taskId}`,
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "viewer_1",
          "x-role": "viewer",
        },
      });
      expect(viewerTaskDelete.statusCode).toBe(403);

      // Viewer can read tasks
      const viewerTaskGet = await app.inject({
        method: "GET",
        url: `/v1/tasks/${taskId}`,
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "viewer_1",
          "x-role": "viewer",
        },
      });
      expect(viewerTaskGet.statusCode).toBe(200);

      // Admin can delete tasks
      const adminTaskDelete = await app.inject({
        method: "DELETE",
        url: `/v1/tasks/${taskId}`,
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "admin_1",
          "x-role": "admin",
        },
      });
      expect(adminTaskDelete.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
