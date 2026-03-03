import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import fastifyRawBody from "fastify-raw-body";
import { InMemoryCloudStore } from "./lib/store.js";
import { PrismaCloudStore } from "./lib/prisma-store.js";
import { registerAuthPlugin } from "./plugins/auth.js";
import { registerIdempotencyPlugin } from "./plugins/idempotency.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerEndpointRoutes } from "./routes/endpoints.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerUsageRoutes } from "./routes/usage.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerApiKeyRoutes } from "./routes/api-keys.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

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
  await registerProjectRoutes(app);
  await registerEndpointRoutes(app);
  await registerJobRoutes(app);
  await registerScheduleRoutes(app);
  await registerRunRoutes(app);
  await registerAlertRoutes(app);
  await registerUsageRoutes(app);
  await registerApiKeyRoutes(app);
  await registerInternalRoutes(app);

  return app;
}
