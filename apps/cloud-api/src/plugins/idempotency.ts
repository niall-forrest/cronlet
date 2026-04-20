import { ERROR_CODES } from "@cronlet/shared";
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { handleError } from "../lib/http.js";

interface CachedResponse {
  bodyHash: string;
  responsePayload: unknown;
  statusCode: number;
}

const cache = new Map<string, CachedResponse>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function hashBody(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

export async function registerIdempotencyPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!["POST", "PATCH"].includes(request.method) || request.url.startsWith("/internal/")) {
      return;
    }

    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 6) {
      return;
    }

    const bodyHash = hashBody(request.body);
    const cacheKey = `${request.auth.orgId}:${request.method}:${request.url}:${key}`;

    if (app.prisma) {
      const hit = await app.prisma.idempotencyKey.findUnique({
        where: {
          organizationId_method_path_key: {
            organizationId: request.auth.orgId,
            method: request.method,
            path: request.url,
            key,
          },
        },
      });
      if (hit && hit.expiresAt > new Date()) {
        if (hit.requestHash !== bodyHash) {
          const response = handleError(
            reply,
            new AppError(409, ERROR_CODES.IDEMPOTENCY_CONFLICT, "Idempotency key reused with different payload")
          );
          reply.send(response);
          return reply;
        }
        reply.status(hit.statusCode).send(hit.responsePayload);
        return reply;
      }
    }

    const hit = cache.get(cacheKey);

    if (!hit) {
      return;
    }

    if (hit.bodyHash !== bodyHash) {
      const response = handleError(
        reply,
        new AppError(409, ERROR_CODES.IDEMPOTENCY_CONFLICT, "Idempotency key reused with different payload")
      );
      reply.send(response);
      return reply;
    }

    reply.status(hit.statusCode).send(hit.responsePayload);
    return reply;
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (!["POST", "PATCH"].includes(request.method) || request.url.startsWith("/internal/")) {
      return payload;
    }

    if (reply.statusCode < 200 || reply.statusCode >= 300) {
      return payload;
    }

    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 6) {
      return payload;
    }

    const bodyHash = hashBody(request.body);
    const cacheKey = `${request.auth.orgId}:${request.method}:${request.url}:${key}`;

    let responsePayload: unknown = payload;
    if (typeof payload === "string") {
      try {
        responsePayload = JSON.parse(payload);
      } catch {
        return payload;
      }
    }

    if (app.prisma) {
      await app.prisma.idempotencyKey.upsert({
        where: {
          organizationId_method_path_key: {
            organizationId: request.auth.orgId,
            method: request.method,
            path: request.url,
            key,
          },
        },
        update: {
          requestHash: bodyHash,
          responsePayload: responsePayload as object,
          statusCode: reply.statusCode,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
        create: {
          organizationId: request.auth.orgId,
          method: request.method,
          path: request.url,
          key,
          requestHash: bodyHash,
          responsePayload: responsePayload as object,
          statusCode: reply.statusCode,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
      return payload;
    }

    cache.set(cacheKey, {
      bodyHash,
      responsePayload,
      statusCode: reply.statusCode,
    });

    return payload;
  });
}
