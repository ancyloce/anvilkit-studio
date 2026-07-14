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
