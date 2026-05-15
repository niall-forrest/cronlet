import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InMemoryCloudStore } from "../src/lib/store.js";
import { buildServer } from "../src/server.js";

const ORG_ID = "org_circuit_breakers";

function headers(role: "owner" | "admin" | "member" | "viewer" = "owner"): Record<string, string> {
  return {
    "x-org-id": ORG_ID,
    "x-user-id": `user_${role}`,
    "x-role": role,
  };
}

describe("circuit breaker controls", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
  });

  it("lists open circuit breakers through the API", async () => {
    const app = await buildServer();

    try {
      const store = app.cloudStore as InMemoryCloudStore;
      const circuitBreakers = (store as unknown as {
        circuitBreakers: Map<string, {
          orgId: string;
          destinationKey: string;
          state: "closed" | "open" | "half_open";
          consecutiveFailures: number;
          openedAt: string | null;
          cooldownUntil: string | null;
          lastFailureAt: string | null;
          lastFailureReason: string | null;
          probeInFlight: boolean;
          createdAt: string;
          updatedAt: string;
        }>;
      }).circuitBreakers;
      circuitBreakers.set(`${ORG_ID}:example.com`, {
        orgId: ORG_ID,
        destinationKey: "example.com",
        state: "open",
        consecutiveFailures: 3,
        openedAt: "2026-01-01T00:00:00.000Z",
        cooldownUntil: "2026-01-01T00:05:00.000Z",
        lastFailureAt: "2026-01-01T00:00:00.000Z",
        lastFailureReason: "upstream 500",
        probeInFlight: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/circuit-breakers?state=open",
        headers: headers("viewer"),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
      expect(response.json().data[0]).toMatchObject({
        destinationKey: "example.com",
        state: "open",
      });
    } finally {
      await app.close();
    }
  });
});
