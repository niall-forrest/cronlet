import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyCronRequest } from "../../src/verify/cron-request.js";

describe("verifyCronRequest", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("in production mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
      process.env.CRON_SECRET = "test-secret";
    });

    it("accepts valid Bearer token", () => {
      const request = new Request("http://localhost/api/cron/test", {
        headers: { Authorization: "Bearer test-secret" },
      });

      const result = verifyCronRequest(request);

      expect(result).toEqual({ ok: true });
    });

    it("rejects missing Authorization header", () => {
      const request = new Request("http://localhost/api/cron/test");

      const result = verifyCronRequest(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Missing Authorization header");
    });

    it("rejects invalid token", () => {
      const request = new Request("http://localhost/api/cron/test", {
        headers: { Authorization: "Bearer wrong-secret" },
      });

      const result = verifyCronRequest(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Invalid Authorization header");
    });

    it("rejects malformed Authorization header", () => {
      const request = new Request("http://localhost/api/cron/test", {
        headers: { Authorization: "Basic test-secret" },
      });

      const result = verifyCronRequest(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Invalid Authorization header");
    });

    it("returns error when CRON_SECRET is not set", () => {
      delete process.env.CRON_SECRET;

      const request = new Request("http://localhost/api/cron/test", {
        headers: { Authorization: "Bearer test-secret" },
      });

      const result = verifyCronRequest(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBe("CRON_SECRET environment variable not set");
    });
  });

  describe("in development mode", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("allows requests without auth", () => {
      const request = new Request("http://localhost/api/cron/test");

      const result = verifyCronRequest(request);

      expect(result).toEqual({ ok: true });
    });

    it("allows requests without CRON_SECRET set", () => {
      delete process.env.CRON_SECRET;

      const request = new Request("http://localhost/api/cron/test");

      const result = verifyCronRequest(request);

      expect(result).toEqual({ ok: true });
    });
  });

  describe("with NextApiRequest-like object", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
      process.env.CRON_SECRET = "test-secret";
    });

    it("accepts valid Bearer token from headers object", () => {
      const request = {
        headers: { authorization: "Bearer test-secret" },
      };

      const result = verifyCronRequest(request);

      expect(result).toEqual({ ok: true });
    });

    it("rejects missing authorization header", () => {
      const request = {
        headers: {},
      };

      const result = verifyCronRequest(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Missing Authorization header");
    });
  });
});
