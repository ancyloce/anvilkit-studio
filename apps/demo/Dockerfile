# syntax=docker/dockerfile:1.7

# Build & run the AnvilKit Next.js demo (apps/demo) as a standalone image.
#
# IMPORTANT: the build context MUST be the repo root. This is a pnpm + Turbo
# monorepo whose `@anvilkit/*` workspace packages live in git submodules, so
# the demo cannot be built in isolation from its own directory. The CI
# workflow builds with `context: .` and `file: apps/demo/Dockerfile`. To build
# locally:  docker build -f apps/demo/Dockerfile -t anvilkit-demo .

# ---- builder ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

# bookworm-slim (glibc) keeps prebuilt native binaries (sharp/esbuild, skipped
# via the workspace `allowBuilds` map) compatible — alpine/musl would not.
# git: the root `prepare` hook calls `git config`. ca-certificates: registry TLS.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# pnpm is pinned via package.json#packageManager; corepack activates that exact
# version (11.9.0) deterministically.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	TURBO_TELEMETRY_DISABLED=1 \
	NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /repo

# Copy the whole monorepo (submodule working trees included on the host
# checkout). The root .dockerignore strips node_modules/build output so the
# context stays lean.
COPY . .

# Install with the committed lockfile. The nested `packages/components`
# workspace has its own lockfile and is installed separately (mirrors CI),
# otherwise Turbo's component-leaf builds trigger a slow mid-build auto-install.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile \
	&& pnpm --dir packages/components install --frozen-lockfile --config.strictDepBuilds=false

# Build the demo and ONLY its workspace dependencies via Turbo (`^build`).
# DOCKER_BUILD flips next.config.js to standalone output (see that file).
ENV DOCKER_BUILD=1
# Route the editor's Save/Publish through /api/pages (the server SQLite adapter)
# instead of localStorage. NEXT_PUBLIC_* is inlined at build time, so it must be
# set BEFORE the build, not as a runtime env.
ENV NEXT_PUBLIC_USE_REMOTE_STORAGE=true
RUN pnpm exec turbo run build --filter=demo --ui=stream

# ---- runner ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0

WORKDIR /app

# Next traces the standalone bundle from the repo root, so the server and its
# pruned node_modules land under apps/demo/. Static assets and public/ are not
# part of the trace and must be copied alongside.
COPY --from=builder /repo/apps/demo/.next/standalone ./
COPY --from=builder /repo/apps/demo/.next/static ./apps/demo/.next/static
COPY --from=builder /repo/apps/demo/public ./apps/demo/public

# Writable, persistent location for the SQLite page store. A mounted volume is
# root-owned by default, so chown it before dropping to the non-root `node` user.
# (Schema is created on boot by ensureSchema(); no migration files to copy.)
RUN mkdir -p /data && chown node:node /data
VOLUME /data

# Server-side page-store selection (read at request time by the API routes). The
# SQLite file lands on /data so published pages survive container restarts.
ENV ANVILKIT_PAGE_STORAGE=sqlite \
	ANVILKIT_PAGE_STORAGE_SQLITE_PATH=/data/pages.sqlite

USER node
EXPOSE 3000

CMD ["node", "apps/demo/server.js"]
