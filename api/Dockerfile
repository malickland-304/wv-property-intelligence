# ---- Build Stage ----
# Compiles native modules (better-sqlite3) against glibc in an isolated layer.
FROM node:20-bookworm-slim AS builder
WORKDIR /workspace
COPY api/package*.json ./api/
RUN cd api && npm ci --omit=dev && npm cache clean --force

# ---- Runtime Stage ----
FROM node:20-bookworm-slim AS runtime

# Patch all OS packages to remediate known CVEs (high/critical vulnerabilities
# reported against the base image ship as unpatched Debian packages).
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy production node_modules built in the builder stage (includes native
# better-sqlite3 binaries compiled against the same glibc).
COPY --from=builder /workspace/api/node_modules ./api/node_modules

# Copy application source (host node_modules excluded via .dockerignore).
COPY api ./api
COPY database ./database
COPY app ./app

# Create runtime directories, then drop to a non-root user.
RUN mkdir -p listings uploads reports data admin \
    && groupadd --system --gid 1001 appgroup \
    && useradd --system --uid 1001 --gid appgroup --no-create-home appuser \
    && chown -R appuser:appgroup /workspace

USER appuser

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

WORKDIR /workspace/api
CMD ["node", "server.js"]
