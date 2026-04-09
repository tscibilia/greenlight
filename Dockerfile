# --- Build stage: install production deps only ---
FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# --- Runtime stage: minimal image ---
FROM node:24-alpine@sha256:01743339035a5c3c11a373cd7c83aeab6ed1457b55da6a69e014a95ac4e4700b

# Configurable UID/GID — override at build or runtime
ARG APP_UID=1000
ARG APP_GID=1000

# Use existing group if GID taken (e.g. 1000 = node in alpine), else create
RUN (getent group ${APP_GID} >/dev/null 2>&1 || addgroup -g ${APP_GID} -S appgroup) && \
    APP_GROUP=$(getent group ${APP_GID} | cut -d: -f1) && \
    adduser -u ${APP_UID} -S appuser -G ${APP_GROUP} 2>/dev/null || \
    echo "[docker] UID ${APP_UID} already exists, reusing"

WORKDIR /app

# Copy deps from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

# Ensure app files are readable by any UID (for runtime override)
RUN chmod -R a+rX /app

# Default to non-root user (overridable via --user or securityContext)
USER ${APP_UID}:${APP_GID}

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "src/server.js"]
