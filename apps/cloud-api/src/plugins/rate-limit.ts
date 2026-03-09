import { ERROR_CODES, RATE_LIMITS } from "@cronlet/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RateLimitResult, RateLimitRule, RateLimitStore } from "../lib/rate-limit-store.js";
import { MemoryRateLimitStore, RedisRateLimitStore } from "../lib/rate-limit-store.js";

const TRIGGER_ROUTE_PATTERN = /^\/v1\/tasks\/[^/]+\/trigger$/;

function requestPath(request: FastifyRequest): string {
  return request.url.split("?")[0] ?? request.url;
}

function shouldSkipRateLimit(request: FastifyRequest): boolean {
  const path = requestPath(request);

  if (request.method === "OPTIONS") {
    return true;
  }

  if (path === "/health") {
    return true;
  }

  if (path.startsWith("/internal/")) {
    return true;
  }

  if (path.startsWith("/webhooks/")) {
    return true;
  }

  return !path.startsWith("/v1/");
}

function routeSpecificRule(request: FastifyRequest): RateLimitRule | null {
  const path = requestPath(request);

  if (request.method === "POST" && path === "/v1/tasks") {
    return RATE_LIMITS.taskCreate;
  }

  if (request.method === "POST" && TRIGGER_ROUTE_PATTERN.test(path)) {
    return RATE_LIMITS.taskTrigger;
  }

  return null;
}

function rateLimitMessage(rule: RateLimitRule): string {
  if (rule.key === RATE_LIMITS.taskCreate.key) {
    return "Task creation rate limit exceeded. Max 60 per hour.";
  }

  if (rule.key === RATE_LIMITS.taskTrigger.key) {
    return "Manual trigger rate limit exceeded. Max 120 per hour.";
  }

  return "API request rate limit exceeded. Max 600 per minute.";
}

function applyHeaders(reply: FastifyReply, result: RateLimitResult): void {
  reply.header("X-RateLimit-Limit", String(result.limit));
  reply.header("X-RateLimit-Remaining", String(result.remaining));
  reply.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
}

function sendRateLimited(reply: FastifyReply, rule: RateLimitRule, result: RateLimitResult): void {
  applyHeaders(reply, result);
  reply.header("Retry-After", String(result.retryAfter));
  reply.status(429).send({
    ok: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: rateLimitMessage(rule),
      details: {
        retryAfter: result.retryAfter,
      },
    },
  });
}

async function checkRule(
  app: FastifyInstance,
  store: RateLimitStore,
  request: FastifyRequest,
  rule: RateLimitRule,
): Promise<RateLimitResult | null> {
  try {
    return await store.consume(request.auth.orgId, rule);
  } catch (error) {
    app.log.warn(
      {
        orgId: request.auth.orgId,
        route: requestPath(request),
        limiterKey: rule.key,
        error: error instanceof Error ? error.message : String(error),
      },
      "Rate limiter unavailable; allowing request",
    );
    return null;
  }
}

function createRateLimitStore(): RateLimitStore {
  if (process.env.CLOUD_RATE_LIMIT_STORE === "memory" || !process.env.REDIS_URL) {
    return new MemoryRateLimitStore();
  }

  return new RedisRateLimitStore(process.env.REDIS_URL);
}

export async function registerRateLimitPlugin(app: FastifyInstance): Promise<void> {
  const store = createRateLimitStore();

  app.addHook("onClose", async () => {
    if (store.close) {
      await store.close();
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (
      shouldSkipRateLimit(request) ||
      !request.auth?.orgId ||
      request.auth.actorType === "internal" ||
      request.auth.actorType === "webhook"
    ) {
      return;
    }

    const globalResult = await checkRule(app, store, request, RATE_LIMITS.apiGlobal);
    if (globalResult?.exceeded) {
      sendRateLimited(reply, RATE_LIMITS.apiGlobal, globalResult);
      return reply;
    }

    const specificRule = routeSpecificRule(request);
    if (!specificRule) {
      request.rateLimitState = globalResult ?? undefined;
      return;
    }

    const specificResult = await checkRule(app, store, request, specificRule);
    if (specificResult?.exceeded) {
      sendRateLimited(reply, specificRule, specificResult);
      return reply;
    }

    request.rateLimitState = specificResult ?? globalResult ?? undefined;
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.rateLimitState && !reply.hasHeader("X-RateLimit-Limit")) {
      applyHeaders(reply, request.rateLimitState);
    }

    return payload;
  });
}
