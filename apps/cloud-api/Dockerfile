# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspaces
COPY packages/cloud-shared/package.json ./packages/cloud-shared/
COPY apps/cloud-api/package.json ./apps/cloud-api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/cloud-shared ./packages/cloud-shared
COPY apps/cloud-api ./apps/cloud-api

# Generate Prisma client and build
RUN pnpm --filter @cronlet/cloud-shared build
RUN pnpm --filter @cronlet/cloud-api prisma:generate
RUN pnpm --filter @cronlet/cloud-api build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/cloud-shared/package.json ./packages/cloud-shared/
COPY --from=builder /app/packages/cloud-shared/dist ./packages/cloud-shared/dist
COPY --from=builder /app/apps/cloud-api/package.json ./apps/cloud-api/
COPY --from=builder /app/apps/cloud-api/dist ./apps/cloud-api/dist
COPY --from=builder /app/apps/cloud-api/prisma ./apps/cloud-api/prisma
COPY --from=builder /app/apps/cloud-api/node_modules/.prisma ./apps/cloud-api/node_modules/.prisma

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/cloud-api

EXPOSE 4050

CMD ["node", "dist/index.js"]
