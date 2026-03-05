import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_demo";
const INTERNAL_TOKEN = "internal-test-token";

function userHeaders(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
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
      // Create task
      const taskRes = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: userHeaders("admin"),
        payload: {
          name: "Digest Task",
          handler: {
            type: "webhook",
            url: "https://example.com/cronlet",
          },
          schedule: {
            type: "daily",
            times: ["09:00"],
          },
          timezone: "UTC",
          retryAttempts: 2,
        },
      });
      expect(taskRes.statusCode).toBe(201);
      const taskId = taskRes.json().data.id as string;

      // Trigger task
      const triggerRes = await app.inject({
        method: "POST",
        url: `/v1/tasks/${taskId}/trigger`,
        headers: userHeaders("member"),
      });
      expect(triggerRes.statusCode).toBe(201);
      const runId = triggerRes.json().data.id as string;

      // Update run status: running
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

      // Update run status: queued (retry)
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

      // Update run status: success (attempt 2)
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

      // Stale failure update should be ignored
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

      // Verify final state is preserved
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
