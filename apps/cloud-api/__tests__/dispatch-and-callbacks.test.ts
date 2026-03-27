import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_dispatch";

function headers(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": `user_${role}`,
    "x-role": role,
  };
}

describe("dispatch and callback lifecycle", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("persists callback and lifecycle fields on create and patch", async () => {
    const app = await buildServer();
    try {
      const createResponse = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Lifecycle Task",
          handler: {
            type: "webhook",
            url: "https://example.com/task",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
          callbackUrl: "https://example.com/callback",
          metadata: {
            reportId: "report_123",
          },
          maxRuns: 2,
          expiresAt: "2026-12-31T23:59:59.000Z",
        },
      });

      expect(createResponse.statusCode).toBe(201);
      expect(createResponse.json().data).toMatchObject({
        callbackUrl: "https://example.com/callback",
        metadata: {
          reportId: "report_123",
        },
        maxRuns: 2,
        expiresAt: "2026-12-31T23:59:59.000Z",
      });

      const taskId = createResponse.json().data.id as string;

      const patchResponse = await app.inject({
        method: "PATCH",
        url: `/v1/tasks/${taskId}`,
        headers: headers("admin"),
        payload: {
          callbackUrl: null,
          metadata: null,
          maxRuns: 1,
          expiresAt: null,
        },
      });

      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json().data).toMatchObject({
        callbackUrl: null,
        metadata: null,
        maxRuns: 1,
        expiresAt: null,
      });
    } finally {
      await app.close();
    }
  });

  it("creates on-demand dispatch runs without exposing hidden tasks", async () => {
    const app = await buildServer();
    try {
      const taskResponse = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Visible Task",
          handler: {
            type: "webhook",
            url: "https://example.com/task",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
        },
      });
      expect(taskResponse.statusCode).toBe(201);

      const dispatchResponse = await app.inject({
        method: "POST",
        url: "/v1/dispatch",
        headers: headers("member"),
        payload: {
          name: "Dispatch now",
          handler: {
            type: "webhook",
            url: "https://example.com/dispatch",
          },
          callbackUrl: "https://example.com/callback",
          metadata: {
            prospectId: "prospect_123",
          },
        },
      });

      expect(dispatchResponse.statusCode).toBe(201);
      expect(dispatchResponse.json().data.status).toBe("queued");

      const listTasksResponse = await app.inject({
        method: "GET",
        url: "/v1/tasks",
        headers: headers("viewer"),
      });
      expect(listTasksResponse.statusCode).toBe(200);
      expect(listTasksResponse.json().data).toHaveLength(1);
      expect(listTasksResponse.json().data[0].name).toBe("Visible Task");

      const runsResponse = await app.inject({
        method: "GET",
        url: "/v1/runs",
        headers: headers("viewer"),
      });
      expect(runsResponse.statusCode).toBe(200);
      expect(runsResponse.json().data).toHaveLength(1);
      expect(runsResponse.json().data[0].status).toBe("queued");
    } finally {
      await app.close();
    }
  });

  it("exposes a callback signing secret for settings", async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/callback-signing-secret",
        headers: headers("admin"),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.secret).toMatch(/^crsig_/);
    } finally {
      await app.close();
    }
  });
});
