import type { CloudAuthContext } from "@cronlet/shared";
import type { PrismaClient } from "@prisma/client";
import type { CloudStore } from "../lib/store-contract.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: CloudAuthContext;
    rawBody?: string | Buffer;
  }

  interface FastifyInstance {
    cloudStore: CloudStore;
    prisma?: PrismaClient;
  }
}
