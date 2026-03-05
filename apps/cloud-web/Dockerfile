# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy package.json files for all workspaces
COPY packages/cloud-shared/package.json ./packages/cloud-shared/
COPY apps/cloud-web/package.json ./apps/cloud-web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/cloud-shared ./packages/cloud-shared
COPY apps/cloud-web ./apps/cloud-web

# Build shared package first
RUN pnpm --filter @cronlet/shared build

# Build args for Vite (passed at build time)
ARG VITE_CLOUD_API_BASE_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CLOUD_MCP_BASE_URL

ENV VITE_CLOUD_API_BASE_URL=$VITE_CLOUD_API_BASE_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLOUD_MCP_BASE_URL=$VITE_CLOUD_MCP_BASE_URL

# Build the web app
RUN pnpm --filter @cronlet/cloud-web build

# Production stage - serve with nginx
FROM nginx:alpine AS runner

# Copy custom nginx config template
COPY apps/cloud-web/nginx.conf /etc/nginx/templates/default.conf.template

# Copy built static files
COPY --from=builder /app/apps/cloud-web/dist /usr/share/nginx/html

# Add health check file
RUN echo '{"ok":true,"service":"cloud-web"}' > /usr/share/nginx/html/health.json

# Default port (Railway will override via PORT env var)
ENV PORT=80

EXPOSE 80

# Use envsubst to substitute PORT at runtime, then start nginx
CMD ["/bin/sh", "-c", "envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
