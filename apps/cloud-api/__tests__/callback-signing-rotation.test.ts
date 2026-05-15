import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_callback_rotate";

function adminHeaders(): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": "admin_callback",
    "x-role": "admin",
  };
}

describe("callback signing secret rotation", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("rotates the callback signing secret and audits the action", async () => {
    const app = await buildServer();

    try {
      const initial = await app.inject({
        method: "GET",
        url: "/v1/callback-signing-secret",
        headers: adminHeaders(),
      });
      expect(initial.statusCode).toBe(200);

      const rotated = await app.inject({
        method: "POST",
        url: "/v1/callback-signing-secret/rotate",
        headers: adminHeaders(),
      });

      expect(rotated.statusCode).toBe(200);
      expect(rotated.json().data.secret).toMatch(/^crsig_/);
      expect(rotated.json().data.secret).not.toBe(initial.json().data.secret);
      expect(rotated.json().data.rotatedAt).toEqual(expect.any(String));

      const audit = await app.inject({
        method: "GET",
        url: "/v1/audit-events?targetType=organization&targetId=org_callback_rotate&action=callback_signing_secret.rotated",
        headers: adminHeaders(),
      });

      expect(audit.statusCode).toBe(200);
      expect(audit.json().data).toHaveLength(1);
      expect(audit.json().data[0].metadata.rotatedAt).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });
});
