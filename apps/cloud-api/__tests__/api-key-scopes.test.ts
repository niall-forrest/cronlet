import { describe, expect, it } from "vitest";
import { authorize } from "../src/lib/permissions.js";

describe("API key scope enforcement", () => {
  it("rejects api-key actor when required scope is missing", () => {
    expect(() =>
      authorize(
        {
          userId: "api_key:key_1",
          orgId: "org_1",
          role: "member",
          actorType: "api_key",
          scopes: ["jobs:read"],
          apiKeyId: "key_1",
        },
        {
          minimumRole: "member",
          requiredScope: "jobs:write",
        }
      )
    ).toThrow(/scope missing/i);
  });

  it("allows api-key actor with wildcard scope", () => {
    expect(() =>
      authorize(
        {
          userId: "api_key:key_2",
          orgId: "org_1",
          role: "member",
          actorType: "api_key",
          scopes: ["*"],
          apiKeyId: "key_2",
        },
        {
          minimumRole: "member",
          requiredScope: "schedules:write",
        }
      )
    ).not.toThrow();
  });
});
