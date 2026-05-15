import { describe, expect, it } from "vitest";
import { assertSafeOutboundUrl, createOutboundPolicyFromEnv } from "./outbound.js";

describe("outbound target policy", () => {
  it("allows public outbound https targets", async () => {
    await expect(assertSafeOutboundUrl("https://api.example.com/hook", {
      allowedHosts: null,
      resolveHostname: async () => ["93.184.216.34"],
    })).resolves.toBeUndefined();
  });

  it("blocks localhost hostnames", async () => {
    await expect(assertSafeOutboundUrl("http://localhost:3000/hook", {
      allowedHosts: null,
      resolveHostname: async () => ["127.0.0.1"],
    })).rejects.toThrow(/blocked local hostname/);
  });

  it("blocks direct private ip addresses", async () => {
    await expect(assertSafeOutboundUrl("http://127.0.0.1:4050/internal", {
      allowedHosts: null,
      resolveHostname: async () => [],
    })).rejects.toThrow(/blocked address/);
  });

  it("blocks hosts that resolve to link-local metadata addresses", async () => {
    await expect(assertSafeOutboundUrl("http://metadata.example.internal/task", {
      allowedHosts: null,
      resolveHostname: async () => ["169.254.169.254"],
    })).rejects.toThrow(/blocked address 169.254.169.254/);
  });

  it("enforces the configured outbound allowlist", async () => {
    await expect(assertSafeOutboundUrl("https://api.example.com/hook", {
      allowedHosts: new Set(["hooks.example.com"]),
      resolveHostname: async () => ["93.184.216.34"],
    })).rejects.toThrow(/configured allowlist/);
  });

  it("parses allowlisted hosts from the environment", () => {
    process.env.CLOUD_ALLOWED_OUTBOUND_HOSTS = "hooks.example.com, api.example.com ";
    expect(createOutboundPolicyFromEnv().allowedHosts).toEqual(new Set(["hooks.example.com", "api.example.com"]));
    delete process.env.CLOUD_ALLOWED_OUTBOUND_HOSTS;
  });
});
