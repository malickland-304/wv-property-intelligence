# ---- Build Stage ----
# Compiles native modules (better-sqlite3) against glibc in an isolated layer.
FROM node:20-bookworm-slim AS builder
WORKDIR /workspace
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

# ---- Runtime Stage ----
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy production node_modules (includes native better-sqlite3 binaries)
COPY --from=builder --chown=65532:65532 /workspace/api/node_modules ./api/node_modules

# Copy application source
COPY --chown=65532:65532 api ./api
COPY --chown=65532:65532 app ./app
COPY --chmod=755 api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Create runtime directories. Railway mounts /data at runtime, so the entrypoint
# fixes volume ownership before dropping to appuser.
RUN mkdir -p /data data database listings uploads reports \
    && groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup --no-create-home appuser \
    && chown -R appuser:appgroup /workspace /data

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

WORKDIR /workspace/api
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
