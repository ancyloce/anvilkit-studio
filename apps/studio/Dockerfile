# syntax=docker/dockerfile:1.7

# Build & run the AnvilKit Next.js Studio app (apps/studio) as a standalone image.
#
# IMPORTANT: the build context MUST be the repo root. This is a pnpm + Turbo
# monorepo whose `@anvilkit/*` workspace packages live in git submodules, so
# the app cannot be built in isolation from its own directory. The CI
# workflow builds with `context: .` and `file: apps/studio/Dockerfile`. To build
# locally:  docker build -f apps/studio/Dockerfile -t anvilkit-studio .

# ---- builder ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

# bookworm-slim (glibc) keeps prebuilt native binaries (sharp/esbuild, skipped
# via the workspace `allowBuilds` map) compatible — alpine/musl would not.
# git: the root `prepare` hook calls `git config`. ca-certificates: registry TLS.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# pnpm is pinned via package.json#packageManager; corepack activates that exact
# version (11.13.0) deterministically.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	TURBO_TELEMETRY_DISABLED=1 \
	NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /repo

# Copy the whole monorepo (submodule working trees included on the host
# checkout). The root .dockerignore strips node_modules/build output so the
# context stays lean.
COPY . .

# Install with the committed lockfile. The nested `packages/extensions/components`
# workspace has its own lockfile and is installed separately (mirrors CI).
#
# ORDER MATTERS: the components-workspace install must run BEFORE the root
# install. `packages/extensions/components` is a nested pnpm workspace whose
# own pnpm-workspace.yaml also claims packages/runtime/ui,
# packages/capabilities/analytics/*, and packages/tooling/configs/* — so
# those shared packages' node_modules get resolved by whichever `pnpm
# install` runs LAST. The components store pins its own (unpatched, and for
# analytics/*, a newer typescript@7.0.2 vs. the root's 6.0.3) dependency
# tree, so running it last silently swaps in different deps for those shared
# packages — for analytics/react this forces rsbuild-plugin-dts onto its
# "tsgo" (TypeScript-Go native-preview) declaration backend, which fails
# with spurious TS7016s resolving a sibling workspace package's types. Same
# root cause as the duplicate-React landmine documented in
# .github/actions/setup-workspace/action.yml — mirror its install order here.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm --dir packages/extensions/components install --frozen-lockfile --config.strictDepBuilds=false \
	&& pnpm install --frozen-lockfile

# Build the app and ONLY its workspace dependencies via Turbo (`^build`).
# DOCKER_BUILD flips next.config.js to standalone output (see that file).
ENV DOCKER_BUILD=1
# Route the editor's Save/Publish through /api/pages (the server SQLite adapter)
# instead of localStorage. NEXT_PUBLIC_* is inlined at build time, so it must be
# set BEFORE the build, not as a runtime env.
ENV NEXT_PUBLIC_USE_REMOTE_STORAGE=true
RUN pnpm exec turbo run build --filter=studio --ui=stream

# ---- runner ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0

WORKDIR /app

# Next traces the standalone bundle from the repo root, so the server and its
# pruned node_modules land under apps/studio/. Static assets and public/ are not
# part of the trace and must be copied alongside.
COPY --from=builder /repo/apps/studio/.next/standalone ./
COPY --from=builder /repo/apps/studio/.next/static ./apps/studio/.next/static
COPY --from=builder /repo/apps/studio/public ./apps/studio/public

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

CMD ["node", "apps/studio/server.js"]
