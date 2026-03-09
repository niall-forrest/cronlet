import type { CloudAuthContext } from "@cronlet/shared";
import type { PrismaClient } from "@prisma/client";
import type { CloudStore } from "../lib/store-contract.js";
import type { RateLimitResult } from "../lib/rate-limit-store.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: CloudAuthContext;
    rawBody?: string | Buffer;
    rateLimitState?: RateLimitResult;
  }

  interface FastifyInstance {
    cloudStore: CloudStore;
    prisma?: PrismaClient;
  }
}
