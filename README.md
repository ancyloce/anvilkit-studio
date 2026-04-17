# AnvilKit Studio

AnvilKit Studio is currently a Puck-first component library monorepo. See the [Contributing Guide](CONTRIBUTING.md) to get started.

Today this repo contains:

- 11 independently publishable `@anvilkit/*` component packages in `packages/components`
- `@anvilkit/ui`, a shared UI primitives package
- shared private config packages in `packages/configs/*`
- `apps/demo`, a Next.js app that validates the same Puck config in editor and render mode

Packages such as `@anvilkit/core`, unified `@anvilkit/plugins`, `@anvilkit/ir`, `@anvilkit/schema`, and `@anvilkit/validator` do not exist in this repository today.

## Quick Start

```bash
git clone <repo-url>
cd anvilkit-studio
git submodule update --init --recursive
pnpm install
pnpm --filter demo dev
```

Open `http://localhost:3000`.

Useful root commands:

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Current Packages

Component packages (11 total):

- `@anvilkit/button`
- `@anvilkit/input`
- `@anvilkit/navbar`
- `@anvilkit/hero`
- `@anvilkit/section`
- `@anvilkit/bento-grid`
- `@anvilkit/blog-list`
- `@anvilkit/helps`
- `@anvilkit/logo-clouds`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

Each component package exports a render component plus `componentConfig`, `defaultProps`, `fields`, and `metadata`. The demo currently wires up 9 of the 11 — `@anvilkit/button` and `@anvilkit/input` are published but not yet imported in `apps/demo/lib/puck-demo.ts`.

## Demo App

The demo app is a validation surface, not a docs site.

- `/` is the demo hub
- `/puck/editor` runs the client editor flow
- `/puck/render` renders the same payload through `@puckeditor/core/rsc`

The shared Puck config lives in `apps/demo/lib/puck-demo.ts`.

## Continuous Integration

`.github/workflows/ci.yml` runs on every pull request (pnpm 10.33.0 / Node 20, submodules pulled recursively):

1. `pnpm lint` — Biome lint
2. `pnpm typecheck` — TypeScript validation
3. `pnpm madge` — circular dependency detection (`madge --circular` across `packages/`)
4. `pnpm test` — Vitest
5. `pnpm build` — build all packages
6. `pnpm publint` — validate `package.json` exports fields
7. Per-package release gates (`check:all`) for core, ir, schema, validator, and plugins
8. Playwright E2E tests against the demo app

## Architecture Context

This README describes the repo as it exists today. For the fuller package plan and roadmap, see [docs/ai-context/anvilkit-architecture.md](docs/ai-context/anvilkit-architecture.md).
