# AnvilKit Studio

AnvilKit Studio is a monorepo of Puck-native React component packages, a Studio runtime, and a plugin ecosystem.

> **AnvilKit Studio v1.0.0-beta is available.** Install with `pnpm add @anvilkit/core@^1.0.0-beta`. See the [migration guide](docs/migration/0.x-to-1.0-beta.md), the [aggregate changelog](CHANGELOG.md), or [file beta feedback](docs/beta-feedback/README.md).
>
> **Looking ahead:** the [LTS policy](docs/policies/lts.md) and the [`beta → 1.0.0` migration notes](docs/migration/1.0-beta-to-1.0.md) are drafted and take effect on the day `v1.0.0` ships.

## What's new in 1.0.0-beta

- **Studio runtime (`@anvilkit/core@1.0.0-beta.0`).** `<Studio>` React shell, `StudioConfigSchema` (Zod-validated config), `compilePlugins`, the `StudioPlugin` contract, and the `StudioError` family — pinned, docs-backed, and gated by a 25 KB gzipped entry-chunk budget.
- **Headless pipeline (`@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator` → `1.0.0-beta.0`).** Round-trip `puckDataToIR` / `irToPuckData`, `configToAiContext` for AI prompts, and `validateAiOutput` / `validateComponentConfig` with documented error codes. Three validator gaps from the phase4-014 security review (`INVALID_ROOT_TYPE`, `INVALID_CHILDREN`, `NON_SERIALIZABLE_PROP`) are closed with flipped-pin tests.
- **Export pipeline (`@anvilkit/plugin-export-html@1.0.0-beta.0`).** First real exporter, with the 24-test XSS/URL/CSS-injection hostile-input battery enforcing the escape contract in CI.
- **AI copilot (`@anvilkit/plugin-ai-copilot@1.0.0-beta.0`).** Headless `createAiCopilotPlugin`, a mock generator (`@anvilkit/plugin-ai-copilot/mock`) for CI harnesses, and structured `ai-copilot:error` events — including an 18-test malformed-PageIR / oversized-input / prompt-injection battery.
- **Docs site ([`docs.anvilkit.dev`](https://anvilkit.dev)).** Starlight-powered, with a generated component catalog, TypeDoc API reference, guides for component / plugin / generator / export / AI workflows, and an interactive Puck playground.
- **Plugin scaffolder (`create-anvilkit-plugin`).** `pnpm dlx create-anvilkit-plugin --name my-plugin --display "My Plugin" --category rail-panel` generates a buildable plugin skeleton wired to `@anvilkit/core/testing`.
- **Shared UI (`@anvilkit/ui@1.0.0-beta.0`).** First public npm publish of the shared primitives used across every component package.

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
