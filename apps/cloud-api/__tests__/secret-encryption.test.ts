import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_secret_encryption";
const INTERNAL_TOKEN = "secret-internal-token";
const KEY_V1 = Buffer.from("12345678901234567890123456789012").toString("base64");
const KEY_V2 = Buffer.from("abcdefghijklmnopqrstuvwxyz123456").toString("base64");

interface MemorySecretRecord {
  id: string;
  orgId: string;
  name: string;
  encryptedValue: string;
  keyVersion: string;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function assertMemorySecretStore(
  store: unknown,
): asserts store is {
  secrets: Map<string, MemorySecretRecord>;
} {
  if (
    typeof store !== "object"
    || store === null
    || !("secrets" in store)
    || !(store.secrets instanceof Map)
  ) {
    throw new Error("Expected memory cloud store with secrets map");
  }
}

function adminHeaders(): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": "admin_secret",
    "x-role": "admin",
  };
}

function internalHeaders(): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-internal-token": INTERNAL_TOKEN,
  };
}

describe("secret encryption metadata", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    process.env.CLOUD_INTERNAL_TOKEN = INTERNAL_TOKEN;
    process.env.CLOUD_SECRET_ENCRYPTION_KEYS = `v1:${KEY_V1},v2:${KEY_V2}`;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLOUD_INTERNAL_TOKEN;
    delete process.env.CLOUD_SECRET_ENCRYPTION_KEYS;
  });

  it("stores secret metadata and returns decrypted values internally", async () => {
    const app = await buildServer();

    try {
      const created = await app.inject({
        method: "POST",
        url: "/v1/secrets",
        headers: adminHeaders(),
        payload: {
          name: "MAILCHIMP_API_KEY",
          value: "secret_123",
        },
      });

      expect(created.statusCode).toBe(201);
      expect(created.json().data).toMatchObject({
        name: "MAILCHIMP_API_KEY",
        keyVersion: "v2",
        lastRotatedAt: expect.any(String),
      });

      const listed = await app.inject({
        method: "GET",
        url: "/v1/secrets",
        headers: adminHeaders(),
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().data[0]).toMatchObject({
        name: "MAILCHIMP_API_KEY",
        keyVersion: "v2",
      });

      const internal = await app.inject({
        method: "GET",
        url: "/internal/secrets/MAILCHIMP_API_KEY",
        headers: internalHeaders(),
      });
      expect(internal.statusCode).toBe(200);
      expect(internal.json().data.value).toBe("secret_123");
    } finally {
      await app.close();
    }
  });

  it("rotates legacy secrets onto the active key version and audits the action", async () => {
    const app = await buildServer();

    try {
      const store: unknown = app.cloudStore;
      assertMemorySecretStore(store);
      store.secrets.set("legacy-secret", {
        id: "legacy-secret",
        orgId: ORG_ID,
        name: "LEGACY_TOKEN",
        encryptedValue: "legacy_plaintext",
        keyVersion: "legacy",
        lastRotatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const rotated = await app.inject({
        method: "POST",
        url: "/v1/secrets/LEGACY_TOKEN/rotate",
        headers: adminHeaders(),
      });

      expect(rotated.statusCode).toBe(200);
      expect(rotated.json().data).toMatchObject({
        name: "LEGACY_TOKEN",
        keyVersion: "v2",
        lastRotatedAt: expect.any(String),
      });

      const internal = await app.inject({
        method: "GET",
        url: "/internal/secrets/LEGACY_TOKEN",
        headers: internalHeaders(),
      });
      expect(internal.statusCode).toBe(200);
      expect(internal.json().data.value).toBe("legacy_plaintext");

      const audit = await app.inject({
        method: "GET",
        url: "/v1/audit-events?targetType=secret&targetId=LEGACY_TOKEN&action=secret.rotated",
        headers: adminHeaders(),
      });
      expect(audit.statusCode).toBe(200);
      expect(audit.json().data).toHaveLength(1);
      expect(audit.json().data[0].metadata.keyVersion).toBe("v2");
    } finally {
      await app.close();
    }
  });
});
