# Cronlet Cloud Foundation

This repository now includes a Cronlet Cloud v1 foundation stack:

- `apps/cloud-api` (Fastify control-plane API)
- `apps/cloud-worker` (BullMQ dispatcher worker)
- `apps/cloud-web` (React + Vite + TanStack UI shell)
- `apps/cloud-mcp` (MCP gateway service with read-only-by-default policy)
- `packages/cloud-shared` (types, schemas, entitlements, error codes)
- `packages/cloud-sdk` (`@cronlet/cloud-sdk`)

## Quick start

1. Install dependencies

```bash
pnpm install
```

2. Configure API env

```bash
cp apps/cloud-api/.env.example apps/cloud-api/.env
```

3. Generate Prisma client and apply schema

```bash
pnpm --filter @cronlet/cloud-api prisma:generate
pnpm --filter @cronlet/cloud-api prisma:migrate:dev
```

4. Start API (Prisma store by default, set `CLOUD_STORE_MODE=memory` for fallback)

```bash
pnpm --filter @cronlet/cloud-api dev
```

5. Start web

```bash
pnpm --filter @cronlet/cloud-web dev
```

6. Optional: start worker and MCP (requires Redis and internal token envs)

```bash
pnpm --filter @cronlet/cloud-worker dev
pnpm --filter @cronlet/cloud-mcp dev
```

## Notes

- Prisma-backed storage is implemented in `apps/cloud-api/src/lib/prisma-store.ts`.
- Initial migration is in `apps/cloud-api/prisma/migrations/0001_init/migration.sql`.
- The API can still run in-memory with `CLOUD_STORE_MODE=memory`.
- Internal worker endpoints are protected by `x-internal-token` (`CLOUD_INTERNAL_TOKEN`).
- Clerk JWT verification is enabled when `CLERK_JWKS_URL` is set.
- Clerk billing/org webhooks are accepted at `POST /webhooks/clerk` and can verify Svix signatures via `CLERK_WEBHOOK_SECRET`.
- Clerk Billing plan-key aliases can be tuned via:
  - `CLERK_BILLING_FREE_PLAN_KEYS` (default: `free,free_user`)
  - `CLERK_BILLING_PRO_PLAN_KEYS` (default: `pro,cronlet_pro`)
  - `CLERK_BILLING_TEAM_PLAN_KEYS` (default: `team,cronlet_team`)
- API authorization is now hardened for control-plane writes:
  - role checks (`viewer`/`member`/`admin`/`owner`) are enforced on endpoint/job/schedule CRUD.
  - API key actors must include required scopes (for example, `jobs:write`, `schedules:write`).
- Audit events are persisted in Postgres (`audit_events`) for auth accept events and webhook-driven org/entitlement mutations.
