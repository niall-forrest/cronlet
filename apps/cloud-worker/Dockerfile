# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspaces
COPY packages/cloud-shared/package.json ./packages/cloud-shared/
COPY apps/cloud-worker/package.json ./apps/cloud-worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/cloud-shared ./packages/cloud-shared
COPY apps/cloud-worker ./apps/cloud-worker

# Build
RUN pnpm --filter @cronlet/cloud-shared build
RUN pnpm --filter @cronlet/cloud-worker build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/cloud-shared/package.json ./packages/cloud-shared/
COPY --from=builder /app/packages/cloud-shared/dist ./packages/cloud-shared/dist
COPY --from=builder /app/apps/cloud-worker/package.json ./apps/cloud-worker/
COPY --from=builder /app/apps/cloud-worker/dist ./apps/cloud-worker/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/cloud-worker

# Worker doesn't expose a port - it polls and processes jobs
CMD ["node", "dist/index.js"]
