import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { buildServer } from "../src/server.js";

function signedHeaders(secret: string, payload: string): Record<string, string> {
  const webhook = new Webhook(secret);
  const timestamp = new Date();
  const messageId = `msg_${Date.now()}`;
  const signature = webhook.sign(messageId, timestamp, payload);

  return {
    "content-type": "application/json",
    "svix-id": messageId,
    "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  };
}

describe("Clerk webhooks", () => {
  const secret = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`;

  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
    process.env.CLERK_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLERK_WEBHOOK_SECRET;
  });

  it("rejects webhook payloads when signature headers are missing", async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/webhooks/clerk",
        payload: JSON.stringify({
          type: "organization.created",
          data: {
            id: "org_sig_test",
            name: "Signature Test Org",
            slug: "signature-test",
          },
        }),
        headers: {
          "content-type": "application/json",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    } finally {
      await app.close();
    }
  });

  it("applies entitlement transitions for free/pro and delinquent grace when signature is valid", async () => {
    const app = await buildServer();
    try {
      const orgId = "org_plan_transition";

      const payloadPro = JSON.stringify({
        type: "billing.subscription.updated",
        data: {
          org_id: orgId,
          plan: "pro",
          status: "active",
        },
      });

      const responsePro = await app.inject({
        method: "POST",
        url: "/webhooks/clerk",
        payload: payloadPro,
        headers: signedHeaders(secret, payloadPro),
      });
      expect(responsePro.statusCode).toBe(200);

      const usageAfterPro = await app.inject({
        method: "GET",
        url: "/v1/usage",
        headers: {
          "x-org-id": orgId,
          "x-user-id": "user_test",
          "x-role": "owner",
        },
      });
      expect(usageAfterPro.statusCode).toBe(200);
      const proBody = usageAfterPro.json();
      expect(proBody.ok).toBe(true);
      expect(proBody.data.tier).toBe("pro");
      expect(proBody.data.delinquent).toBe(false);
      expect(proBody.data.graceEndsAt).toBeNull();

      const payloadDelinquent = JSON.stringify({
        type: "billing.subscription.updated",
        data: {
          org_id: orgId,
          plan: "free",
          status: "past_due",
        },
      });
      const responseDelinquent = await app.inject({
        method: "POST",
        url: "/webhooks/clerk",
        payload: payloadDelinquent,
        headers: signedHeaders(secret, payloadDelinquent),
      });
      expect(responseDelinquent.statusCode).toBe(200);

      const usageAfterDelinquent = await app.inject({
        method: "GET",
        url: "/v1/usage",
        headers: {
          "x-org-id": orgId,
          "x-user-id": "user_test",
          "x-role": "owner",
        },
      });
      expect(usageAfterDelinquent.statusCode).toBe(200);
      const delinquentBody = usageAfterDelinquent.json();
      expect(delinquentBody.ok).toBe(true);
      expect(delinquentBody.data.tier).toBe("free");
      expect(delinquentBody.data.delinquent).toBe(true);
      expect(delinquentBody.data.graceEndsAt).toBeTypeOf("string");
      expect(new Date(delinquentBody.data.graceEndsAt).getTime()).toBeGreaterThan(Date.now());
    } finally {
      await app.close();
    }
  });
});
