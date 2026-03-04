import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_demo";
const INTERNAL_TOKEN = "internal-test-token";

function userHeaders(role: "owner" | "admin" | "member" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": "user_test",
    "x-role": role,
  };
}

describe("run lifecycle API boundary", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    process.env.CLOUD_INTERNAL_TOKEN = INTERNAL_TOKEN;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLOUD_INTERNAL_TOKEN;
  });

  it("preserves monotonic attempts and terminal state across internal status updates", async () => {
    const app = await buildServer();
    try {
      const projectRes = await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers: userHeaders("owner"),
        payload: {
          name: "Lifecycle Project",
          slug: "lifecycle-project",
        },
      });
      expect(projectRes.statusCode).toBe(201);
      const projectId = projectRes.json().data.id as string;

      const endpointRes = await app.inject({
        method: "POST",
        url: "/v1/endpoints",
        headers: userHeaders("admin"),
        payload: {
          projectId,
          environment: "prod",
          name: "Primary Endpoint",
          url: "https://example.com/cronlet",
          authMode: "none",
          timeoutMs: 30000,
        },
      });
      expect(endpointRes.statusCode).toBe(201);
      const endpointId = endpointRes.json().data.id as string;

      const jobRes = await app.inject({
        method: "POST",
        url: "/v1/jobs",
        headers: userHeaders("admin"),
        payload: {
          projectId,
          environment: "prod",
          endpointId,
          name: "Digest",
          key: "digest",
          concurrency: "skip",
          catchup: false,
          retryAttempts: 2,
          retryBackoff: "linear",
          retryInitialDelay: "1s",
          timeout: "30s",
        },
      });
      expect(jobRes.statusCode).toBe(201);
      const jobId = jobRes.json().data.id as string;

      const triggerRes = await app.inject({
        method: "POST",
        url: `/v1/jobs/${jobId}/trigger`,
        headers: userHeaders("member"),
      });
      expect(triggerRes.statusCode).toBe(201);
      const runId = triggerRes.json().data.id as string;

      const runningRes = await app.inject({
        method: "POST",
        url: `/internal/runs/${runId}/status`,
        headers: {
          "x-internal-token": INTERNAL_TOKEN,
        },
        payload: {
          status: "running",
          attempt: 1,
        },
      });
      expect(runningRes.statusCode).toBe(200);

      const retryQueuedRes = await app.inject({
        method: "POST",
        url: `/internal/runs/${runId}/status`,
        headers: {
          "x-internal-token": INTERNAL_TOKEN,
        },
        payload: {
          status: "queued",
          attempt: 1,
          durationMs: 200,
          errorMessage: "Retrying: temporary failure",
        },
      });
      expect(retryQueuedRes.statusCode).toBe(200);

      const successRes = await app.inject({
        method: "POST",
        url: `/internal/runs/${runId}/status`,
        headers: {
          "x-internal-token": INTERNAL_TOKEN,
        },
        payload: {
          status: "success",
          attempt: 2,
          durationMs: 450,
        },
      });
      expect(successRes.statusCode).toBe(200);
      const successRun = successRes.json().data;
      expect(successRun.status).toBe("success");
      expect(successRun.attempt).toBe(2);
      expect(successRun.startedAt).toBeTypeOf("string");
      expect(successRun.completedAt).toBeTypeOf("string");
      expect(successRun.durationMs).toBe(450);
      expect(successRun.errorMessage).toBeNull();

      const staleFailureRes = await app.inject({
        method: "POST",
        url: `/internal/runs/${runId}/status`,
        headers: {
          "x-internal-token": INTERNAL_TOKEN,
        },
        payload: {
          status: "failure",
          attempt: 1,
          durationMs: 999,
          errorMessage: "stale",
        },
      });
      expect(staleFailureRes.statusCode).toBe(200);

      const latestRunRes = await app.inject({
        method: "GET",
        url: `/v1/runs/${runId}`,
        headers: userHeaders("viewer"),
      });
      expect(latestRunRes.statusCode).toBe(200);
      const latestRun = latestRunRes.json().data;
      expect(latestRun.status).toBe("success");
      expect(latestRun.attempt).toBe(2);
      expect(latestRun.durationMs).toBe(450);
      expect(latestRun.errorMessage).toBeNull();
    } finally {
      await app.close();
    }
  });
});
