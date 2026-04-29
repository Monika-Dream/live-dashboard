# Stage 1: Build dashboard frontend (no admin panel)
FROM oven/bun:1-alpine AS frontend-base
WORKDIR /build
COPY packages/frontend/package.json packages/frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY packages/frontend/ ./

FROM frontend-base AS frontend-dashboard-build
ENV NEXT_PUBLIC_ENABLE_ADMIN_PANEL=false
RUN bun run build

# Stage 2: Build admin frontend (with admin panel)
FROM frontend-base AS frontend-admin-build
ENV NEXT_PUBLIC_ENABLE_ADMIN_PANEL=true
RUN bun run build

# Stage 3: Run backend + serve static files
FROM oven/bun:1-alpine
WORKDIR /app

# Non-root user with writable home
RUN addgroup -S dashboard && adduser -S dashboard -G dashboard -h /home/dashboard

# Copy backend
COPY packages/backend/package.json packages/backend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY packages/backend/ ./

# Copy frontend build outputs (display + admin)
COPY --from=frontend-dashboard-build /build/out ./public
COPY --from=frontend-admin-build /build/out ./admin-public

# Data directory for SQLite (owned by non-root user)
RUN mkdir -p /data && chown dashboard:dashboard /data

ENV STATIC_DIR=/app/public
ENV ADMIN_STATIC_DIR=/app/admin-public
ENV DB_PATH=/data/live-dashboard.db
ENV PORT=3000
ENV ADMIN_PORT=3001
ENV NODE_ENV=production
ENV HOME=/home/dashboard

USER dashboard
EXPOSE 3000 3001
CMD ["bun", "run", "src/index.ts"]
