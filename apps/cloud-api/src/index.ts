import { buildServer } from "./server.js";

// Validate required environment variables in production
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const required = [
    "DATABASE_URL",
    "CLOUD_INTERNAL_TOKEN",
    "CLERK_JWKS_URL",
    "CLERK_ISSUER",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const port = Number.parseInt(process.env.PORT ?? "4050", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildServer();
await app.listen({ port, host });
