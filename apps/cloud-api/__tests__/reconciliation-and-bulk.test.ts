import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_reconcile";

function headers(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": `user_${role}`,
    "x-role": role,
  };
}

describe("reconciliation and bulk task controls", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("filters tasks and runs by externalId and metadata", async () => {
    const app = await buildServer();
    try {
      const createA = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Email step 1",
          externalId: "email_1",
          handler: { type: "webhook", url: "https://example.com/a" },
          schedule: { type: "daily", times: ["09:00"] },
          metadata: { workflow: "drip", step: "1" },
        },
      });
      const createB = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Email step 2",
          externalId: "email_2",
          handler: { type: "webhook", url: "https://example.com/b" },
          schedule: { type: "daily", times: ["10:00"] },
          metadata: { workflow: "drip", step: "2" },
        },
      });

      const taskAId = createA.json().data.id as string;
      await app.inject({
        method: "POST",
        url: `/v1/tasks/${taskAId}/trigger`,
        headers: headers("member"),
      });

      const tasksResponse = await app.inject({
        method: "GET",
        url: `/v1/tasks?externalId=email_1&metadata=${encodeURIComponent(JSON.stringify({ workflow: "drip" }))}`,
        headers: headers("viewer"),
      });

      expect(tasksResponse.statusCode).toBe(200);
      expect(tasksResponse.json().data).toHaveLength(1);
      expect(tasksResponse.json().data[0].externalId).toBe("email_1");

      const runsResponse = await app.inject({
        method: "GET",
        url: `/v1/runs?externalId=email_1&metadata=${encodeURIComponent(JSON.stringify({ workflow: "drip" }))}`,
        headers: headers("viewer"),
      });

      expect(runsResponse.statusCode).toBe(200);
      expect(runsResponse.json().data).toHaveLength(1);
      expect(runsResponse.json().data[0].taskId).toBe(taskAId);

      expect(createB.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  it("bulk cancels matching tasks and bulk replays matching runs", async () => {
    const app = await buildServer();
    try {
      const created = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/tasks",
          headers: headers("admin"),
          payload: {
            name: "Follow up A",
            externalId: "followup_a",
            handler: { type: "webhook", url: "https://example.com/a" },
            schedule: { type: "daily", times: ["09:00"] },
            metadata: { batch: "alpha" },
          },
        }),
        app.inject({
          method: "POST",
          url: "/v1/tasks",
          headers: headers("admin"),
          payload: {
            name: "Follow up B",
            externalId: "followup_b",
            handler: { type: "webhook", url: "https://example.com/b" },
            schedule: { type: "daily", times: ["10:00"] },
            metadata: { batch: "alpha" },
          },
        }),
      ]);

      const firstTaskId = created[0].json().data.id as string;
      await app.inject({
        method: "POST",
        url: `/v1/tasks/${firstTaskId}/trigger`,
        headers: headers("member"),
      });

      const bulkCancel = await app.inject({
        method: "POST",
        url: "/v1/tasks/bulk-cancel",
        headers: headers("admin"),
        payload: {
          metadata: { batch: "alpha" },
        },
      });

      expect(bulkCancel.statusCode).toBe(200);
      expect(bulkCancel.json().data.count).toBe(2);
      expect(bulkCancel.json().data.results.every((result: { guarantee: string }) => result.guarantee === "no-new-attempts")).toBe(true);

      const bulkReplay = await app.inject({
        method: "POST",
        url: "/v1/runs/bulk-replay",
        headers: headers("member"),
        payload: {
          externalId: "followup_a",
        },
      });

      expect(bulkReplay.statusCode).toBe(201);
      expect(bulkReplay.json().data.count).toBe(1);
      expect(bulkReplay.json().data.results[0].replayOfRunId).toBeTypeOf("string");
    } finally {
      await app.close();
    }
  });

  it("compares reconciliation state for matched, missing, pending, and overdue tasks", async () => {
    const app = await buildServer();
    try {
      const pendingResponse = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Pending once",
          externalId: "once_pending",
          handler: { type: "webhook", url: "https://example.com/pending" },
          schedule: { type: "once", at: "2026-12-01T09:00:00.000Z" },
          metadata: { campaign: "spring" },
        },
      });

      const overdueResponse = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        headers: headers("admin"),
        payload: {
          name: "Overdue task",
          externalId: "once_overdue",
          handler: { type: "webhook", url: "https://example.com/overdue" },
          schedule: { type: "daily", times: ["09:00"] },
          metadata: { campaign: "spring" },
        },
      });

      const cloudStore = app.cloudStore as unknown as { tasks: Map<string, Record<string, unknown>> };
      const tasks = cloudStore.tasks;
      const overdueTaskId = overdueResponse.json().data.id as string;
      const currentOverdue = tasks.get(overdueTaskId);
      if (!currentOverdue) {
        throw new Error("overdue task missing");
      }
      tasks.set(overdueTaskId, {
        ...currentOverdue,
        nextRunAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const compareResponse = await app.inject({
        method: "POST",
        url: "/v1/reconciliation/compare",
        headers: headers("viewer"),
        payload: {
          externalIds: ["once_pending", "missing_task"],
          metadata: { campaign: "spring" },
        },
      });

      expect(compareResponse.statusCode).toBe(200);
      expect(compareResponse.json().data.matchedTasks.map((task: { externalId: string | null }) => task.externalId)).toContain("once_pending");
      expect(compareResponse.json().data.missingExternalIds).toContain("missing_task");
      expect(compareResponse.json().data.pendingOneOffTasks.map((task: { externalId: string | null }) => task.externalId)).toContain("once_pending");
      expect(compareResponse.json().data.overdueTasks.map((task: { externalId: string | null }) => task.externalId)).toContain("once_overdue");

      expect(pendingResponse.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
