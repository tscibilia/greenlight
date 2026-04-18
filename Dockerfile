# --- Build stage: install production deps only ---
FROM node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# --- Runtime stage: minimal image ---
FROM node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f

# Configurable UID/GID — override at build or runtime
ARG APP_UID=1000
ARG APP_GID=1000

# Patch OS-level CVEs and strip npm/yarn (not needed at runtime — reduces attack surface)
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm \
           /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

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
