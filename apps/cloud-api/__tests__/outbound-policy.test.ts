import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_outbound_policy";

function adminHeaders(): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": "admin_outbound",
    "x-role": "admin",
  };
}

describe("outbound policy routes", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("updates and returns the org outbound allowlist", async () => {
    const app = await buildServer();

    try {
      const updated = await app.inject({
        method: "PATCH",
        url: "/v1/outbound-policy",
        headers: adminHeaders(),
        payload: {
          allowedHosts: ["Hooks.Example.com", "api.example.com.", "hooks.example.com"],
        },
      });

      expect(updated.statusCode).toBe(200);
      expect(updated.json().data).toMatchObject({
        allowedHosts: ["api.example.com", "hooks.example.com"],
        updatedAt: expect.any(String),
      });

      const fetched = await app.inject({
        method: "GET",
        url: "/v1/outbound-policy",
        headers: adminHeaders(),
      });

      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().data.allowedHosts).toEqual(["api.example.com", "hooks.example.com"]);
    } finally {
      await app.close();
    }
  });

  it("records audit events for outbound policy updates", async () => {
    const app = await buildServer();

    try {
      const updated = await app.inject({
        method: "PATCH",
        url: "/v1/outbound-policy",
        headers: adminHeaders(),
        payload: {
          allowedHosts: ["jobs.example.com"],
        },
      });

      expect(updated.statusCode).toBe(200);

      const audit = await app.inject({
        method: "GET",
        url: "/v1/audit-events?targetType=organization&targetId=org_outbound_policy&action=outbound_policy.updated",
        headers: adminHeaders(),
      });

      expect(audit.statusCode).toBe(200);
      expect(audit.json().data).toHaveLength(1);
      expect(audit.json().data[0].metadata.allowedHosts).toEqual(["jobs.example.com"]);
    } finally {
      await app.close();
    }
  });
});
