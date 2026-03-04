import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("audit timeline and api key governance", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("records API key lifecycle and supports audit filtering", async () => {
    const app = await buildServer();

    try {
      const orgId = "org_audit_1";
      const ownerHeaders = {
        "x-org-id": orgId,
        "x-user-id": "owner_1",
        "x-role": "owner",
      };
      const adminHeaders = {
        "x-org-id": orgId,
        "x-user-id": "admin_1",
        "x-role": "admin",
      };
      const viewerHeaders = {
        "x-org-id": orgId,
        "x-user-id": "viewer_1",
        "x-role": "viewer",
      };

      const createKey = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: adminHeaders,
        payload: {
          label: "CI Key",
          scopes: ["jobs:read", "jobs:write"],
        },
      });
      expect(createKey.statusCode).toBe(201);
      const createdKeyId = createKey.json().data.apiKey.id as string;

      const rotateKey = await app.inject({
        method: "POST",
        url: `/v1/api-keys/${createdKeyId}/rotate`,
        headers: adminHeaders,
        payload: {
          scopes: ["jobs:read"],
        },
      });
      expect(rotateKey.statusCode).toBe(200);

      const revokeKey = await app.inject({
        method: "DELETE",
        url: `/v1/api-keys/${createdKeyId}`,
        headers: adminHeaders,
      });
      expect(revokeKey.statusCode).toBe(200);

      const allEvents = await app.inject({
        method: "GET",
        url: "/v1/audit-events",
        headers: viewerHeaders,
      });
      expect(allEvents.statusCode).toBe(200);
      const allBody = allEvents.json();
      expect(allBody.ok).toBe(true);
      expect(Array.isArray(allBody.data)).toBe(true);
      expect(allBody.data.length).toBeGreaterThanOrEqual(3);
      expect(
        allBody.data.some((event: { action: string }) => event.action === "api_key.created")
      ).toBe(true);
      expect(
        allBody.data.some((event: { action: string }) => event.action === "api_key.rotated")
      ).toBe(true);
      expect(
        allBody.data.some((event: { action: string }) => event.action === "api_key.revoked")
      ).toBe(true);

      const createdOnly = await app.inject({
        method: "GET",
        url: "/v1/audit-events?action=api_key.created&limit=10",
        headers: ownerHeaders,
      });
      expect(createdOnly.statusCode).toBe(200);
      const createdBody = createdOnly.json();
      expect(createdBody.ok).toBe(true);
      expect(createdBody.data.length).toBeGreaterThanOrEqual(1);
      expect(
        createdBody.data.every((event: { action: string }) => event.action === "api_key.created")
      ).toBe(true);

      const futureWindow = await app.inject({
        method: "GET",
        url: "/v1/audit-events?from=2099-01-01T00:00:00.000Z&to=2099-12-31T23:59:59.000Z",
        headers: viewerHeaders,
      });
      expect(futureWindow.statusCode).toBe(200);
      const futureBody = futureWindow.json();
      expect(futureBody.ok).toBe(true);
      expect(futureBody.data).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("denies non-admin API key lifecycle writes", async () => {
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/api-keys",
        headers: {
          "x-org-id": "org_audit_2",
          "x-user-id": "member_1",
          "x-role": "member",
        },
        payload: {
          label: "Should Fail",
          scopes: ["jobs:read"],
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    } finally {
      await app.close();
    }
  });
});
