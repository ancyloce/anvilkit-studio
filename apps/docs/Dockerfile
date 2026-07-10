# syntax=docker/dockerfile:1.7

# Build & run the AnvilKit Fumadocs site (apps/docs) as a standalone image.
#
# IMPORTANT: the build context MUST be the repo root (same monorepo/submodule
# reason as apps/studio/Dockerfile). The CI workflow builds with `context: .`
# and `file: apps/docs/Dockerfile`. To build locally:
#   docker build -f apps/docs/Dockerfile -t anvilkit-docs .

# ---- builder ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
	TURBO_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /repo
COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile \
	&& pnpm --dir packages/components install --frozen-lockfile --config.strictDepBuilds=false

# NITRO_PRESET=node-server makes the Nitro/TanStack-Start build emit a runnable
# Node server (.output/server/index.mjs) instead of the default Vercel build
# output. vite.config.ts reads this env var (defaults to "vercel" when unset).
ENV NITRO_PRESET=node-server
RUN pnpm exec turbo run docs:build --filter=@anvilkit/docs-site --ui=stream

# ---- runner ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
	PORT=4321 \
	HOST=0.0.0.0

WORKDIR /app

# Nitro's node-server output is fully self-contained (deps bundled in), so no
# node_modules install is needed at runtime.
COPY --from=builder /repo/apps/docs/.output ./.output

USER node
EXPOSE 4321

CMD ["node", ".output/server/index.mjs"]
