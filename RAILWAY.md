# Deploying Cronlet to Railway

This guide covers deploying the Cronlet platform to Railway.

## Architecture

Cronlet requires 4 services + 2 addons:

```
┌─────────────────────────────────────────────────────────┐
│  Railway Project: cronlet                               │
├─────────────────────────────────────────────────────────┤
│  Services:                                              │
│  ├── cloud-api     (Fastify API)      Port 4050        │
│  ├── cloud-web     (Nginx static)     Port 80          │
│  ├── cloud-worker  (BullMQ worker)    No port          │
│  └── cloud-mcp     (MCP server)       Port 4060        │
│                                                         │
│  Addons:                                                │
│  ├── PostgreSQL                                         │
│  └── Redis                                              │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Create Railway Project

```bash
railway login
railway init
```

### 2. Add Database Addons

In the Railway dashboard:
- Add PostgreSQL addon
- Add Redis addon

### 3. Deploy Services

Create 4 services from this repo. For each service:

| Service | Root Directory | Dockerfile | Port |
|---------|---------------|------------|------|
| cloud-api | `apps/cloud-api` | `Dockerfile` | 4050 |
| cloud-web | `apps/cloud-web` | `Dockerfile` | 80 |
| cloud-worker | `apps/cloud-worker` | `Dockerfile` | - |
| cloud-mcp | `apps/cloud-mcp` | `Dockerfile` | 4060 |

### 4. Configure Environment Variables

See sections below for each service.

---

## Service: cloud-api

**Health Check:** `GET /health`

### Required Variables

```env
# Database (from Railway Postgres addon)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Store mode
CLOUD_STORE_MODE=prisma

# Internal auth (generate a secure random string)
CLOUD_INTERNAL_TOKEN=<generate-32-char-secret>

# CORS (set to cloud-web domain)
CLOUD_WEB_ORIGINS=https://cronlet-web.up.railway.app

# Clerk authentication
CLERK_JWKS_URL=https://your-clerk-instance.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-instance.clerk.accounts.dev
```

### Optional Variables

```env
PORT=4050
HOST=0.0.0.0
CLERK_WEBHOOK_SECRET=whsec_...
```

---

## Service: cloud-web

**Health Check:** `GET /health`

### Build Args (set as env vars)

These are embedded at build time:

```env
VITE_CLOUD_API_BASE_URL=https://cronlet-api.up.railway.app
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLOUD_MCP_BASE_URL=https://cronlet-mcp.up.railway.app
```

---

## Service: cloud-worker

**No health check** (background worker)

### Required Variables

```env
# API connection
CLOUD_API_BASE_URL=https://cronlet-api.up.railway.app
CLOUD_INTERNAL_TOKEN=<same-as-cloud-api>

# Redis (from Railway Redis addon)
REDIS_URL=${{Redis.REDIS_URL}}
```

### Optional Variables

```env
CLOUD_POLL_INTERVAL_MS=15000
CLOUD_DISPATCH_QUEUE_NAME=cronlet-cloud-dispatch
```

---

## Service: cloud-mcp

**Health Check:** `GET /health`

### Required Variables

```env
# API connection
CLOUD_API_BASE_URL=https://cronlet-api.up.railway.app
CLOUD_API_KEY=<create-api-key-in-dashboard>

# Service tokens for MCP principals
CLOUD_MCP_SERVICE_TOKENS_JSON={"token1":{"orgId":"org_xxx","userId":"user_xxx","scopes":["*"],"projectIds":["*"]}}
```

### Optional Variables

```env
PORT=4060
HOST=0.0.0.0
CLOUD_MCP_ENABLE_WRITES=true
CLOUD_MCP_APPROVAL_TTL_MINUTES=30
CLOUD_MCP_ORG_ID=org_default
CLOUD_MCP_USER_ID=mcp_service
```

---

## Post-Deployment

### 1. Run Database Migrations

After cloud-api is deployed, run migrations:

```bash
railway run --service cloud-api -- pnpm prisma migrate deploy
```

Or connect to the Railway shell and run:

```bash
cd apps/cloud-api && npx prisma migrate deploy
```

### 2. Verify Health Checks

```bash
curl https://cronlet-api.up.railway.app/health
curl https://cronlet-web.up.railway.app/health
curl https://cronlet-mcp.up.railway.app/health
```

### 3. Create Initial API Key

Use the dashboard to create an API key for the MCP service.

---

## Troubleshooting

### Service won't start

Check logs for missing environment variables:
```
Missing required environment variables: DATABASE_URL, CLERK_JWKS_URL
```

### Worker not processing jobs

1. Verify REDIS_URL is set correctly
2. Check cloud-api is accessible from worker
3. Verify CLOUD_INTERNAL_TOKEN matches between api and worker

### CORS errors

Ensure CLOUD_WEB_ORIGINS includes your cloud-web domain.

### Clerk auth not working

1. Verify CLERK_JWKS_URL and CLERK_ISSUER are correct
2. Check Clerk dashboard for the correct values
3. Ensure VITE_CLERK_PUBLISHABLE_KEY is set for cloud-web

---

## Security Notes

1. **CLOUD_INTERNAL_TOKEN**: Generate a secure random string (32+ chars)
2. **API Keys**: Create separate API keys for different services
3. **CORS**: Only allow your frontend domain in production
4. **Database**: Railway Postgres is encrypted at rest
5. **Redis**: Use Railway Redis for automatic TLS
