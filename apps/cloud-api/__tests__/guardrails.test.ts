import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_guardrails";
const INTERNAL_TOKEN = "guardrails-internal-token";

function headers(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": `user_${role}`,
    "x-role": role,
  };
}

function internalHeaders(): Record<string, string> {
  return {
    "x-internal-token": INTERNAL_TOKEN,
    "x-org-id": ORG_ID,
  };
}

function taskPayload(name: string, stepCount = 1) {
  return {
    name,
    handler: {
      type: "tools",
      steps: Array.from({ length: stepCount }, (_, index) => ({
        tool: "http.get",
        args: { url: `https://example.com/${index}` },
      })),
    },
    schedule: {
      type: "daily",
      times: ["09:00"],
    },
    timezone: "UTC",
  };
}

async function createTask(app: FastifyInstance, name: string, role: "admin" | "owner" = "admin") {
  return app.inject({
    method: "POST",
    url: "/v1/tasks",
    headers: headers(role),
    payload: taskPayload(name),
  });
}

describe("agent safety guardrails", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    process.env.CLOUD_RATE_LIMIT_STORE = "memory";
    process.env.CLOUD_INTERNAL_TOKEN = INTERNAL_TOKEN;
    delete process.env.REDIS_URL;
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLOUD_RATE_LIMIT_STORE;
    delete process.env.CLOUD_INTERNAL_TOKEN;
    delete process.env.REDIS_URL;
    vi.restoreAllMocks();
  });

  it("returns 429 after the task creation limit is exceeded", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-09T10:00:00.000Z").getTime());
    const app = await buildServer();

    try {
      await app.cloudStore.upsertEntitlementForOrg(ORG_ID, {
        tier: "pro",
        delinquent: false,
        graceEndsAt: null,
      });

      for (let index = 0; index < 60; index += 1) {
        const response = await createTask(app, `Task ${index}`);
        expect(response.statusCode).toBe(201);
      }

      const limited = await createTask(app, "Task 61");
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBeDefined();
      expect(limited.headers["x-ratelimit-limit"]).toBe("60");
      expect(limited.headers["x-ratelimit-remaining"]).toBe("0");
      expect(limited.json()).toMatchObject({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Task creation rate limit exceeded. Max 60 per hour.",
          details: {
            retryAfter: expect.any(Number),
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("returns 429 after the manual trigger limit is exceeded", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-09T10:00:00.000Z").getTime());
    const app = await buildServer();

    try {
      const created = await createTask(app, "Trigger Task");
      const taskId = created.json().data.id as string;

      for (let index = 0; index < 120; index += 1) {
        const response = await app.inject({
          method: "POST",
          url: `/v1/tasks/${taskId}/trigger`,
          headers: headers("member"),
        });
        expect(response.statusCode).toBe(201);
      }

      const limited = await app.inject({
        method: "POST",
        url: `/v1/tasks/${taskId}/trigger`,
        headers: headers("member"),
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.headers["x-ratelimit-limit"]).toBe("120");
      expect(limited.json().error.code).toBe("RATE_LIMITED");
    } finally {
      await app.close();
    }
  });

  it("returns 429 after the global external API limit is exceeded", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-09T10:00:00.000Z").getTime());
    const app = await buildServer();

    try {
      for (let index = 0; index < 600; index += 1) {
        const response = await app.inject({
          method: "GET",
          url: "/v1/org-status",
          headers: headers("viewer"),
        });
        expect(response.statusCode).toBe(200);
      }

      const limited = await app.inject({
        method: "GET",
        url: "/v1/org-status",
        headers: headers("viewer"),
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.headers["x-ratelimit-limit"]).toBe("600");
      expect(limited.json().error.code).toBe("RATE_LIMITED");
    } finally {
      await app.close();
    }
  });

  it("does not limit exempt routes", async () => {
    const app = await buildServer();

    try {
      for (let index = 0; index < 600; index += 1) {
        await app.inject({
          method: "GET",
          url: "/v1/org-status",
          headers: headers("viewer"),
        });
      }

      const health = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(health.statusCode).toBe(200);

      const internal = await app.inject({
        method: "GET",
        url: "/internal/tasks/due",
        headers: {
          "x-internal-token": INTERNAL_TOKEN,
        },
      });
      expect(internal.statusCode).toBe(200);

      const webhook = await app.inject({
        method: "POST",
        url: "/webhooks/clerk",
        payload: {
          type: "organization.updated",
          data: {
            id: "org_1",
            name: "Org 1",
            slug: "org-1",
          },
        },
      });
      expect(webhook.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("blocks free tier orgs at 10 non-deleted tasks", async () => {
    const app = await buildServer();

    try {
      for (let index = 0; index < 10; index += 1) {
        const response = await createTask(app, `Free ${index}`);
        expect(response.statusCode).toBe(201);
      }

      const blocked = await createTask(app, "Free 10");
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json()).toMatchObject({
        ok: false,
        error: {
          code: "TASK_LIMIT_EXCEEDED",
          details: {
            currentCount: 10,
            limit: 10,
            tier: "free",
          },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("treats team as pro for task caps", async () => {
    const app = await buildServer();

    try {
      await app.cloudStore.upsertEntitlementForOrg(ORG_ID, {
        tier: "team",
        delinquent: false,
        graceEndsAt: null,
      });

      for (let index = 0; index < 100; index += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/v1/tasks",
          headers: internalHeaders(),
          payload: taskPayload(`Team ${index}`),
        });
        expect(response.statusCode).toBe(201);
      }

      const blocked = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: internalHeaders(),
        payload: taskPayload("Team 100"),
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.details.limit).toBe(100);
      expect(blocked.json().error.details.tier).toBe("team");
    } finally {
      await app.close();
    }
  });

  it("counts paused tasks toward the task cap", async () => {
    const app = await buildServer();

    try {
      const taskIds: string[] = [];
      for (let index = 0; index < 10; index += 1) {
        const response = await createTask(app, `Paused ${index}`);
        taskIds.push(response.json().data.id as string);
      }

      const pauseResponse = await app.inject({
        method: "PATCH",
        url: `/v1/tasks/${taskIds[0]}`,
        headers: headers("admin"),
        payload: {
          active: false,
        },
      });
      expect(pauseResponse.statusCode).toBe(200);

      const blocked = await createTask(app, "Still blocked");
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe("TASK_LIMIT_EXCEEDED");
    } finally {
      await app.close();
    }
  });

  it("allows creating a new task after one is deleted", async () => {
    const app = await buildServer();

    try {
      const createdIds: string[] = [];
      for (let index = 0; index < 10; index += 1) {
        const response = await createTask(app, `Delete ${index}`);
        createdIds.push(response.json().data.id as string);
      }

      const deleted = await app.inject({
        method: "DELETE",
        url: `/v1/tasks/${createdIds[0]}`,
        headers: headers("admin"),
      });
      expect(deleted.statusCode).toBe(200);

      const created = await createTask(app, "Replacement");
      expect(created.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it("rejects tools handlers with more than 10 steps", async () => {
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: taskPayload("Too many steps", 11),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    } finally {
      await app.close();
    }
  });

  it("rejects metadata larger than 16KB", async () => {
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          ...taskPayload("Large metadata"),
          metadata: {
            payload: "x".repeat(17 * 1024),
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    } finally {
      await app.close();
    }
  });

  it("fails open when the Redis limiter is unavailable", async () => {
    process.env.CLOUD_RATE_LIMIT_STORE = "redis";
    process.env.REDIS_URL = "redis://127.0.0.1:1";

    const app = await buildServer();
    const warnSpy = vi.spyOn(app.log, "warn");

    try {
      const response = await createTask(app, "Redis down task");
      expect(response.statusCode).toBe(201);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
