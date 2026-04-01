# AnvilKit Studio

AnvilKit Studio is currently a Puck-first component library monorepo.

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
- `pnpm check-types`

## Current Packages

Component packages:

- `@anvilkit/hero`
- `@anvilkit/navbar`
- `@anvilkit/section`
- `@anvilkit/bento-grid`
- `@anvilkit/blog-list`
- `@anvilkit/helps`
- `@anvilkit/logo-clouds`
- `@anvilkit/pricing-minimal`
- `@anvilkit/statistics`

Each component package exports a render component plus `componentConfig`, `defaultProps`, `fields`, and `metadata`.

## Demo App

The demo app is a validation surface, not a docs site.

- `/` is the demo hub
- `/puck/editor` runs the client editor flow
- `/puck/render` renders the same payload through `@puckeditor/core/rsc`

The shared Puck config lives in `apps/demo/lib/puck-demo.ts`.

## Architecture Context

This README describes the repo as it exists today. For the fuller package plan and roadmap, see [docs/ai-context/anvilkit-architecture.md](docs/ai-context/anvilkit-architecture.md).
