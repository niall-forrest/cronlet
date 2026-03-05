# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspaces
COPY packages/cloud-shared/package.json ./packages/cloud-shared/
COPY packages/cloud-sdk/package.json ./packages/cloud-sdk/
COPY apps/cloud-mcp/package.json ./apps/cloud-mcp/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/cloud-shared ./packages/cloud-shared
COPY packages/cloud-sdk ./packages/cloud-sdk
COPY apps/cloud-mcp ./apps/cloud-mcp

# Build
RUN pnpm --filter @cronlet/shared build
RUN pnpm --filter @cronlet/cloud-sdk build
RUN pnpm --filter @cronlet/cloud-mcp build

# Production stage
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/package.json ./
COPY --from=builder /app/packages/cloud-shared/package.json ./packages/cloud-shared/
COPY --from=builder /app/packages/cloud-shared/dist ./packages/cloud-shared/dist
COPY --from=builder /app/packages/cloud-sdk/package.json ./packages/cloud-sdk/
COPY --from=builder /app/packages/cloud-sdk/dist ./packages/cloud-sdk/dist
COPY --from=builder /app/apps/cloud-mcp/package.json ./apps/cloud-mcp/
COPY --from=builder /app/apps/cloud-mcp/dist ./apps/cloud-mcp/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/cloud-mcp

EXPOSE 4060

CMD ["node", "dist/index.js"]
