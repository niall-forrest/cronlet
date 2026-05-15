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

  it("records task, run, and secret lifecycle events with target filters", async () => {
    const app = await buildServer();

    try {
      const orgId = "org_audit_3";
      const adminHeaders = {
        "x-org-id": orgId,
        "x-user-id": "admin_2",
        "x-role": "admin",
      };

      const createdTask = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: adminHeaders,
        payload: {
          name: "Send welcome email",
          externalId: "email_send_1",
          schedule: {
            type: "once",
            at: "2026-05-20T09:00:00.000Z",
          },
          handler: {
            type: "webhook",
            url: "https://example.com/email/send",
          },
          metadata: {
            workflow: "drip",
          },
        },
      });
      expect(createdTask.statusCode).toBe(201);
      const taskId = createdTask.json().data.id as string;

      const updatedTask = await app.inject({
        method: "PATCH",
        url: `/v1/tasks/${taskId}`,
        headers: adminHeaders,
        payload: {
          name: "Send welcome email v2",
        },
      });
      expect(updatedTask.statusCode).toBe(200);

      const triggeredRun = await app.inject({
        method: "POST",
        url: `/v1/tasks/${taskId}/trigger`,
        headers: adminHeaders,
      });
      expect(triggeredRun.statusCode).toBe(201);
      const runId = triggeredRun.json().data.id as string;

      const replayedRun = await app.inject({
        method: "POST",
        url: `/v1/runs/${runId}/replay`,
        headers: adminHeaders,
      });
      expect(replayedRun.statusCode).toBe(201);
      const replayRunId = replayedRun.json().data.run.id as string;

      const createdSecret = await app.inject({
        method: "POST",
        url: "/v1/secrets",
        headers: adminHeaders,
        payload: {
          name: "MAILCHIMP_API_KEY",
          value: "secret_123",
        },
      });
      expect(createdSecret.statusCode).toBe(201);

      const updatedSecret = await app.inject({
        method: "PATCH",
        url: "/v1/secrets/MAILCHIMP_API_KEY",
        headers: adminHeaders,
        payload: {
          value: "secret_456",
        },
      });
      expect(updatedSecret.statusCode).toBe(200);

      const deletedSecret = await app.inject({
        method: "DELETE",
        url: "/v1/secrets/MAILCHIMP_API_KEY",
        headers: adminHeaders,
      });
      expect(deletedSecret.statusCode).toBe(200);

      const taskAudit = await app.inject({
        method: "GET",
        url: `/v1/audit-events?targetType=task&targetId=${taskId}`,
        headers: adminHeaders,
      });
      expect(taskAudit.statusCode).toBe(200);
      expect(taskAudit.json().data.map((event: { action: string }) => event.action)).toEqual(
        expect.arrayContaining(["task.created", "task.updated"])
      );

      const runAudit = await app.inject({
        method: "GET",
        url: `/v1/audit-events?targetType=run&targetId=${runId}`,
        headers: adminHeaders,
      });
      expect(runAudit.statusCode).toBe(200);
      expect(runAudit.json().data.map((event: { action: string }) => event.action)).toContain("task.triggered");

      const replayAudit = await app.inject({
        method: "GET",
        url: `/v1/audit-events?targetType=run&targetId=${replayRunId}`,
        headers: adminHeaders,
      });
      expect(replayAudit.statusCode).toBe(200);
      expect(replayAudit.json().data.map((event: { action: string }) => event.action)).toContain("run.replayed");

      const secretAudit = await app.inject({
        method: "GET",
        url: "/v1/audit-events?targetType=secret&targetId=MAILCHIMP_API_KEY&actionPrefix=secret.",
        headers: adminHeaders,
      });
      expect(secretAudit.statusCode).toBe(200);
      expect(secretAudit.json().data.map((event: { action: string }) => event.action)).toEqual(
        expect.arrayContaining(["secret.created", "secret.updated", "secret.deleted"])
      );
    } finally {
      await app.close();
    }
  });
});
