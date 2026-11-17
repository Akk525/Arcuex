# Arcuex public-beta image: Node 20 + native better-sqlite3 + Next.js web app.
# Persistent ledger must live on a Railway volume mounted at /data — never the container FS.

# pnpm@11.20 requires Node.js >= 22.13 (uses node:sqlite). Keep engines flexible for local Node 20+
# tooling, but the production image must match the packageManager major.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/agent-sdk/package.json packages/agent-sdk/package.json
COPY packages/chain/package.json packages/chain/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/insurance/package.json packages/insurance/package.json
COPY packages/onchain/package.json packages/onchain/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/quicknode/package.json packages/quicknode/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Build-time env is not production-enforced; runtime validation happens on start.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm -r --filter './packages/*' typecheck && pnpm --filter @arcuex/web build

FROM base AS runner
# sqlite3 CLI is used for crash-safe .backup snapshots on start and restore drills.
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    ARCUEX_DATA_DIR=/data \
    ARCUE_X_SQLITE_PATH=/data/arcuex.sqlite
WORKDIR /app

COPY --from=build /app /app
COPY deploy/railway/entrypoint.sh /entrypoint.sh
COPY deploy/railway/backup-sqlite.sh /usr/local/bin/arcuex-backup-sqlite
COPY deploy/railway/restore-sqlite.sh /usr/local/bin/arcuex-restore-sqlite
RUN chmod +x /entrypoint.sh /usr/local/bin/arcuex-backup-sqlite /usr/local/bin/arcuex-restore-sqlite \
  && mkdir -p /data/backups

# Railway volumes mount as root. Prefer RAILWAY_RUN_UID=0 (documented in the runbook)
# so the process can read/write /data. Do not bake application secrets into the image.
EXPOSE 3000
# Do not declare Docker VOLUME here — Railway requires a Railway Volume mount at /data.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["pnpm", "--filter", "@arcuex/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
