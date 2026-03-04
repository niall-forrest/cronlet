import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("idempotency plugin", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("replays same response for same key+payload and rejects mismatched payload", async () => {
    const app = await buildServer();

    try {
      const headers = {
        "x-org-id": "org_idem_1",
        "x-user-id": "user_owner",
        "x-role": "owner",
        "idempotency-key": "idem-project-create-1",
      };

      const first = await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers,
        payload: {
          name: "Idempotency Project",
          slug: "idempotency-project",
        },
      });

      expect(first.statusCode).toBe(201);
      const firstBody = first.json();
      expect(firstBody.ok).toBe(true);

      const replay = await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers,
        payload: {
          name: "Idempotency Project",
          slug: "idempotency-project",
        },
      });

      expect(replay.statusCode).toBe(201);
      const replayBody = replay.json();
      expect(replayBody.ok).toBe(true);
      expect(replayBody.data.id).toBe(firstBody.data.id);

      const conflict = await app.inject({
        method: "POST",
        url: "/v1/projects",
        headers,
        payload: {
          name: "Changed Payload",
          slug: "changed-payload",
        },
      });

      expect(conflict.statusCode).toBe(409);
      const conflictBody = conflict.json();
      expect(conflictBody.ok).toBe(false);
      expect(conflictBody.error.code).toBe("IDEMPOTENCY_CONFLICT");
    } finally {
      await app.close();
    }
  });
});
