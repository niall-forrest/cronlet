import { ERROR_CODES } from "@cronlet/cloud-shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../lib/errors.js";
import { handleError } from "../lib/http.js";

interface CachedResponse {
  bodyHash: string;
  responsePayload: unknown;
  statusCode: number;
}

const cache = new Map<string, CachedResponse>();

export async function registerIdempotencyPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    if (!["POST", "PATCH"].includes(request.method) || request.url.startsWith("/internal/")) {
      return;
    }

    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 6) {
      return;
    }

    const bodyHash = JSON.stringify(request.body ?? {});
    const cacheKey = `${request.auth.orgId}:${request.method}:${request.url}:${key}`;
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

    const bodyHash = JSON.stringify(request.body ?? {});
    const cacheKey = `${request.auth.orgId}:${request.method}:${request.url}:${key}`;

    let responsePayload: unknown = payload;
    if (typeof payload === "string") {
      try {
        responsePayload = JSON.parse(payload);
      } catch {
        return payload;
      }
    }

    cache.set(cacheKey, {
      bodyHash,
      responsePayload,
      statusCode: reply.statusCode,
    });

    return payload;
  });
}
