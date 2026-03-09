import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_source";

function headers(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": `user_${role}`,
    "x-role": role,
  };
}

describe("task source and org status", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("defaults dashboard-created tasks to source=dashboard and returns it via create/list/get", async () => {
    const app = await buildServer();

    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Dashboard Task",
          handler: {
            type: "webhook",
            url: "https://example.com/hook",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
          timezone: "UTC",
        },
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json().data.source).toBe("dashboard");
      const taskId = createResponse.json().data.id as string;

      const listResponse = await app.inject({
        method: "GET",
        url: "/v1/tasks",
        headers: headers("viewer"),
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: taskId,
            source: "dashboard",
          }),
        ]),
      );

      const getResponse = await app.inject({
        method: "GET",
        url: `/v1/tasks/${taskId}`,
        headers: headers("viewer"),
      });

      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json().data.source).toBe("dashboard");
    } finally {
      await app.close();
    }
  });

  it("exposes a viewer-readable boolean for whether the org has any API keys", async () => {
    const app = await buildServer();

    try {
      const initialStatus = await app.inject({
        method: "GET",
        url: "/v1/org-status",
        headers: headers("viewer"),
      });

      expect(initialStatus.statusCode).toBe(200);
      expect(initialStatus.json().data).toEqual({ hasApiKeys: false });

      const createKey = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: headers("admin"),
        payload: {
          label: "Programmatic Access",
          scopes: ["*"],
        },
      });

      expect(createKey.statusCode).toBe(201);

      const statusAfterKey = await app.inject({
        method: "GET",
        url: "/v1/org-status",
        headers: headers("viewer"),
      });

      expect(statusAfterKey.statusCode).toBe(200);
      expect(statusAfterKey.json().data).toEqual({ hasApiKeys: true });
    } finally {
      await app.close();
    }
  });
});
