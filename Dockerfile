# ARCHON — Autonomous Agent OS (spec 09_DEVELOPER_IMPLEMENTATION/DOCKER_BUILD_AND_RUNTIME_GUIDE).
# The spec's 4-mount layout collapses onto ARCHON's single data root (var/intel).
# All Autonomous-OS feature flags ship OFF — the image is byte-for-byte the current
# product until an operator opts a block into shadow/active.
#
# NOTE: agents authenticate with the operator's Claude subscription via the `claude`
# CLI (KURU_CLAUDE_BIN) — NOT an API key. Mount ~/.claude and provide the CLI at run
# time (this image does not bundle it).

FROM node:20-slim

WORKDIR /app

# Install deps against the lockfile (acorn etc.; no ajv/js-yaml — invariant 8).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source.
COPY . .

# Portable roots → the in-container data layer (single mount).
ENV KURU_AGENTS_ROOT=/app \
    KURU_INTEL_ROOT=/app/var/intel \
    PORT=4000 \
    ARCHON_ENABLE_AUTONOMOUS_OS=false

EXPOSE 4000

# Health = the dashboard responds. (Per-block health.json lives under var/intel.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Default service = the operator portal. The daemon runs as the other compose service.
CMD ["node", "scripts/dashboard.js"]
