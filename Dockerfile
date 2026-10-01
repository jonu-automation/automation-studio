# ============================================================
# Stage 1: Install all dependencies + build everything
# ============================================================
FROM node:22-slim AS builder

RUN npm install -g pnpm@9 --no-update-notifier

WORKDIR /build

# Copy workspace manifests first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/db/package.json                        ./lib/db/
COPY lib/api-spec/package.json                  ./lib/api-spec/
COPY lib/api-client-react/package.json          ./lib/api-client-react/
COPY artifacts/api-server/package.json          ./artifacts/api-server/
COPY artifacts/n8n-automation/package.json      ./artifacts/n8n-automation/

# Install all deps (including dev — needed to build)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy full source
COPY . .

# Build API server (esbuild bundles to dist/index.mjs — fully self-contained)
RUN pnpm --filter @workspace/api-server run build

# Build frontend SPA
RUN pnpm --filter @workspace/n8n-automation run build

# ============================================================
# Stage 2: Slim API server image
# ============================================================
FROM node:22-slim AS app

RUN npm install -g pnpm@9 --no-update-notifier

WORKDIR /app

# Copy the bundled API server (esbuild output — no node_modules needed)
COPY --from=builder /build/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy db package for migrations (drizzle-kit push runs at startup)
COPY --from=builder /build/lib/db ./lib/db
COPY --from=builder /build/lib/integrations ./lib/integrations 2>/dev/null || true
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Install only what the migration needs (drizzle-kit + drizzle-orm)
COPY --from=builder /build/lib/db/package.json ./lib/db/package.json
RUN pnpm --filter @workspace/db install --prod --ignore-scripts 2>/dev/null || \
    cd lib/db && npm install --omit=dev 2>/dev/null || true

# Install drizzle-kit globally for the entrypoint migration step
RUN npm install -g drizzle-kit --no-update-notifier

COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]

# ============================================================
# Stage 3: Nginx — serves frontend + proxies /api to app
# ============================================================
FROM nginx:1.27-alpine AS web

# Copy built frontend SPA
COPY --from=builder /build/artifacts/n8n-automation/dist /usr/share/nginx/html

# Default nginx config (replaced by docker-compose volume mount if needed)
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
