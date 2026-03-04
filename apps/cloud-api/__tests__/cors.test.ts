import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("Cloud API CORS", () => {
  beforeEach(() => {
    process.env.CLOUD_STORE_MODE = "memory";
  });

  afterEach(() => {
    delete process.env.CLOUD_STORE_MODE;
    delete process.env.CLOUD_WEB_ORIGINS;
  });

  it("allows localhost origins by default for browser preflight", async () => {
    const app = await buildServer();
    const origin = "http://127.0.0.1:5173";

    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/v1/projects",
        headers: {
          origin,
          "access-control-request-method": "GET",
          "access-control-request-headers": "authorization,content-type",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      await app.close();
    }
  });

  it("does not allow origins outside the configured list", async () => {
    process.env.CLOUD_WEB_ORIGINS = "https://app.cronlet.dev";
    const app = await buildServer();

    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/v1/projects",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "GET",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
