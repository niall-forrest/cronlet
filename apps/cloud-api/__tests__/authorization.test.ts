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

  it("blocks viewer role from endpoint/job/schedule CRUD while allowing owner/admin", async () => {
    const app = await buildServer();
    try {
      const createProject = await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "owner_1",
          "x-role": "owner",
        },
        payload: {
          name: "Authz Project",
          slug: "authz-project",
        },
      });
      expect(createProject.statusCode).toBe(201);
      const projectId = createProject.json().data.id as string;

      const viewerEndpointCreate = await app.inject({
        method: "POST",
        url: "/v1/endpoints",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "viewer_1",
          "x-role": "viewer",
        },
        payload: {
          projectId,
          environment: "prod",
          name: "Main Endpoint",
          url: "https://example.com/cronlet",
          authMode: "none",
          timeoutMs: 30000,
        },
      });
      expect(viewerEndpointCreate.statusCode).toBe(403);
      expect(viewerEndpointCreate.json().error.code).toBe("FORBIDDEN");

      const adminEndpointCreate = await app.inject({
        method: "POST",
        url: "/v1/endpoints",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "admin_1",
          "x-role": "admin",
        },
        payload: {
          projectId,
          environment: "prod",
          name: "Main Endpoint",
          url: "https://example.com/cronlet",
          authMode: "none",
          timeoutMs: 30000,
        },
      });
      expect(adminEndpointCreate.statusCode).toBe(201);
      const endpointId = adminEndpointCreate.json().data.id as string;

      const adminJobCreate = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "admin_1",
          "x-role": "admin",
        },
        payload: {
          projectId,
          environment: "prod",
          endpointId,
          name: "Digest Job",
          key: "digest-job",
          concurrency: "skip",
          catchup: false,
          retryAttempts: 1,
          retryBackoff: "linear",
          retryInitialDelay: "1s",
          timeout: "30s",
        },
      });
      expect(adminJobCreate.statusCode).toBe(201);
      const jobId = adminJobCreate.json().data.id as string;

      const viewerScheduleCreate = await app.inject({
        method: "POST",
        url: "/v1/schedules",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "viewer_1",
          "x-role": "viewer",
        },
        payload: {
          jobId,
          cron: "*/5 * * * *",
          timezone: "UTC",
          active: true,
        },
      });
      expect(viewerScheduleCreate.statusCode).toBe(403);
      expect(viewerScheduleCreate.json().error.code).toBe("FORBIDDEN");

      const adminScheduleCreate = await app.inject({
        method: "POST",
        url: "/v1/schedules",
        headers: {
          "x-org-id": "org_authz",
          "x-user-id": "admin_1",
          "x-role": "admin",
        },
        payload: {
          jobId,
          cron: "*/5 * * * *",
          timezone: "UTC",
          active: true,
        },
      });
      expect(adminScheduleCreate.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
