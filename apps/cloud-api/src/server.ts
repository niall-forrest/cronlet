import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import fastifyRawBody from "fastify-raw-body";
import { InMemoryCloudStore } from "./lib/store.js";
import { PrismaCloudStore } from "./lib/prisma-store.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerIdempotencyPlugin } from "./plugins/idempotency.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerSecretRoutes } from "./routes/secrets.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";
import { registerAuditEventRoutes } from "./routes/audit-events.js";

const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const CORS_ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-org-id",
  "x-user-id",
  "x-role",
  "x-api-key",
  "x-idempotency-key",
  "x-internal-token",
];

function parseCorsOrigins(rawValue: string | undefined): Set<string> {
  if (!rawValue) {
    return new Set();
  }

  return new Set(
    rawValue
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

export async function buildServer() {
  const app = Fastify({ logger: true });
  const configuredCorsOrigins = parseCorsOrigins(process.env.CLOUD_WEB_ORIGINS);
  const corsOrigin = configuredCorsOrigins.size > 0
    ? Array.from(configuredCorsOrigins)
    : LOCAL_ORIGIN_PATTERN;

  await app.register(fastifyCors, {
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: CORS_ALLOWED_HEADERS,
    origin: corsOrigin,
  });

  await app.register(fastifyRawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  const wantsMemoryStore = process.env.CLOUD_STORE_MODE === "memory";
  const hasDatabase = Boolean(process.env.DATABASE_URL);

  if (!wantsMemoryStore && hasDatabase) {
    const prisma = new PrismaClient();
    await prisma.$connect();
    app.decorate("prisma", prisma);
    app.decorate("cloudStore", new PrismaCloudStore(prisma));

    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  } else {
    app.decorate("cloudStore", new InMemoryCloudStore());
  }

  await registerAuthPlugin(app);
  await registerIdempotencyPlugin(app);

  app.get("/health", async () => ({ ok: true, service: "cloud-api" }));

  await registerWebhookRoutes(app);
  await registerTaskRoutes(app);
  await registerRunRoutes(app);
  await registerSecretRoutes(app);
  await registerAlertRoutes(app);
  await registerUsageRoutes(app);
  await registerApiKeyRoutes(app);
  await registerAuditEventRoutes(app);
  await registerInternalRoutes(app);

  return app;
}
