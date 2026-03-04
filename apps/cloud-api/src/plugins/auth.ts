import { ERROR_CODES } from "@cronlet/cloud-shared";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";
import { recordAuditEvent } from "../lib/audit.js";
import { hashApiKey } from "../lib/api-keys.js";
import { personalOrgIdForUser } from "../lib/tenancy.js";

const DEFAULT_ORG_ID = "org_demo";
const DEFAULT_USER_ID = "user_demo";

function parseRole(raw: unknown): "owner" | "admin" | "member" | "viewer" {
  if (typeof raw !== "string") {
    return "owner";
  }

  const normalized = raw.replace(/^org:/, "");
  if (normalized === "admin" || normalized === "member" || normalized === "viewer") {
    return normalized;
  }

  return "owner";
}

function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

function extractApiKey(request: {
  headers: {
    authorization?: string;
    "x-api-key"?: string;
  };
}): string | null {
  const explicit = request.headers["x-api-key"];
  if (typeof explicit === "string" && explicit.length > 0) {
    return explicit;
  }

  const authorization = request.headers.authorization;
  const token = typeof authorization === "string" ? bearerToken(authorization) : null;
  if (!token) {
    return null;
  }

  return token.startsWith("ck_") ? token : null;
}

function orgFromPayload(payload: JWTPayload): string | null {
  const orgId = payload.org_id;
  if (typeof orgId === "string" && orgId.length > 0) {
    return orgId;
  }
  return null;
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  const clerkJwksUrl = process.env.CLERK_JWKS_URL;
  const clerkIssuer = process.env.CLERK_ISSUER;
  const clerkJwks = clerkJwksUrl ? createRemoteJWKSet(new URL(clerkJwksUrl)) : null;
  const internalToken = process.env.CLOUD_INTERNAL_TOKEN
    ?? (process.env.NODE_ENV === "production" ? undefined : "dev-internal-token");

  app.addHook("preHandler", async (request) => {
    if (request.url.startsWith("/health")) {
      request.auth = {
        userId: DEFAULT_USER_ID,
        orgId: DEFAULT_ORG_ID,
        role: "owner",
        actorType: "internal",
        scopes: ["*"],
        apiKeyId: null,
      };
      return;
    }

    if (request.url.startsWith("/webhooks/clerk")) {
      request.auth = {
        userId: "clerk_webhook",
        orgId: DEFAULT_ORG_ID,
        role: "owner",
        actorType: "webhook",
        scopes: ["*"],
        apiKeyId: null,
      };
      return;
    }

    // Accept internal token for any route (used by MCP and worker)
    const providedInternalToken = request.headers["x-internal-token"];
    if (internalToken && providedInternalToken === internalToken) {
      request.auth = {
        userId: "internal_service",
        orgId: DEFAULT_ORG_ID,
        role: "owner",
        actorType: "internal",
        scopes: ["*"],
        apiKeyId: null,
      };
      return;
    }

    if (request.url.startsWith("/internal/")) {
      const provided = request.headers["x-internal-token"];
      if (!internalToken || provided !== internalToken) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid internal token");
      }
      request.auth = {
        userId: "internal_worker",
        orgId: DEFAULT_ORG_ID,
        role: "owner",
        actorType: "internal",
        scopes: ["*"],
        apiKeyId: null,
      };

      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        await recordAuditEvent(app, {
          organizationId: DEFAULT_ORG_ID,
          actorType: "internal",
          actorId: "internal_worker",
          action: "auth.internal.accepted",
          targetType: "request",
          targetId: `${request.method} ${request.url}`,
          metadata: {
            path: request.url,
          },
        });
      }
      return;
    }

    const apiKey = extractApiKey({
      headers: {
        authorization: typeof request.headers.authorization === "string" ? request.headers.authorization : undefined,
        "x-api-key": typeof request.headers["x-api-key"] === "string" ? request.headers["x-api-key"] : undefined,
      },
    });
    if (apiKey) {
      if (!app.prisma) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "API key auth requires database-backed mode");
      }

      const apiKeyHash = hashApiKey(apiKey);
      const key = await app.prisma.apiKey.findFirst({
        where: { keyHash: apiKeyHash },
      });
      if (!key) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid API key");
      }

      request.auth = {
        userId: `api_key:${key.id}`,
        orgId: key.organizationId,
        role: "member",
        actorType: "api_key",
        scopes: key.scopes,
        apiKeyId: key.id,
      };

      await app.prisma.apiKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      });

      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        await recordAuditEvent(app, {
          organizationId: key.organizationId,
          actorType: "api_key",
          actorId: key.id,
          action: "auth.api_key.accepted",
          targetType: "request",
          targetId: `${request.method} ${request.url}`,
          metadata: {
            path: request.url,
            scopes: key.scopes,
          },
        });
      }
      return;
    }

    if (clerkJwks) {
      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" ? bearerToken(authorization) : null;
      if (!token) {
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Missing bearer token");
      }

      try {
        const verifyResult = await jwtVerify(token, clerkJwks, {
          issuer: clerkIssuer,
        });
        const payload = verifyResult.payload;
        const orgIdHeader = request.headers["x-org-id"];
        const orgIdFromHeader = typeof orgIdHeader === "string" ? orgIdHeader : null;
        const orgId = orgFromPayload(payload) ?? orgIdFromHeader ?? personalOrgIdForUser(payload.sub ?? "");

        if (!orgId) {
          throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "No organization selected");
        }

        if (typeof payload.sub !== "string" || payload.sub.length === 0) {
          throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid token subject");
        }

        request.auth = {
          userId: payload.sub,
          orgId,
          role: parseRole(payload.org_role),
          actorType: "user",
          scopes: ["*"],
          apiKeyId: null,
        };

        await app.cloudStore.upsertOrganization({
          orgId,
        });

        if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
          await recordAuditEvent(app, {
            organizationId: orgId,
            actorType: "user",
            actorId: payload.sub,
            action: "auth.user.accepted",
            targetType: "request",
            targetId: `${request.method} ${request.url}`,
            metadata: {
              path: request.url,
              role: request.auth.role,
              mode: "clerk_jwt",
            },
          });
        }
        return;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid bearer token");
      }
    }

    // Placeholder auth for phase-0: use headers while integrating Clerk middleware.
    const orgIdHeader = request.headers["x-org-id"];
    const userIdHeader = request.headers["x-user-id"];
    const roleHeader = request.headers["x-role"];

    request.auth = {
      orgId: typeof orgIdHeader === "string" ? orgIdHeader : DEFAULT_ORG_ID,
      userId: typeof userIdHeader === "string" ? userIdHeader : DEFAULT_USER_ID,
      role:
        roleHeader === "admin" || roleHeader === "member" || roleHeader === "viewer"
          ? roleHeader
          : "owner",
      actorType: "user",
      scopes: ["*"],
      apiKeyId: null,
    };

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      await recordAuditEvent(app, {
        organizationId: request.auth.orgId,
        actorType: "user",
        actorId: request.auth.userId,
        action: "auth.user.accepted",
        targetType: "request",
        targetId: `${request.method} ${request.url}`,
        metadata: {
          path: request.url,
          role: request.auth.role,
          mode: "header_fallback",
        },
      });
    }
  });
}
