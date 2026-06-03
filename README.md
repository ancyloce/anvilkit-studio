# AnvilKit Studio

AnvilKit Studio is a monorepo of [Puck](https://puckeditor.com/)-native React component packages, a Studio runtime, and a plugin ecosystem. Components, plugins, and templates are each published as independent `@anvilkit/*` npm packages.

> **AnvilKit Studio v1.0.0-beta is rolling out.** The runtime cone (`@anvilkit/core`, `ir`, `schema`, `validator`) and the first-party plugins are pinned to the `1.0.0-beta` line. Component packages stay on their independent `0.0.x` cadence and are not bumped to `1.0` with this release. See the [aggregate changelog](CHANGELOG.md), the [migration guide](docs/migration/0.x-to-1.0-beta.md), or [file beta feedback](docs/beta-feedback/README.md).
>
> **Looking ahead:** the [LTS policy](docs/policies/lts.md) and the [`beta → 1.0` migration notes](docs/migration/1.0-beta-to-1.0.md) take effect on the day `v1.0.0` ships.

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

- `pnpm dev` — Turbo watch mode across every package
- `pnpm build` — build all packages
- `pnpm lint` — Biome lint
- `pnpm typecheck` — TypeScript across the workspace
- `pnpm test` — Vitest across the workspace
- `pnpm madge` — circular dependency scan
- `pnpm publint` — validate `package.json` exports
- `pnpm size` — per-package gzip budgets via `size-limit`
- `pnpm bench` — tinybench perf harness against `bench/baseline.json`
- `pnpm docs:dev` — Starlight docs site on port 4321

## Package map

### Runtime cone (`packages/`)

| Package                   | Role                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `@anvilkit/core`          | `<Studio>` shell, plugin engine, lifecycle bus, Zustand stores.       |
| `@anvilkit/ir`            | Headless Page IR transforms (`puckDataToIR`, `irToPuckData`, …).      |
| `@anvilkit/schema`        | AI-friendly schema derivation from a Puck `Config`.                   |
| `@anvilkit/validator`     | Export-readiness validation + AI-output trust boundary.               |
| `@anvilkit/ui`            | Shared shadcn-style UI primitives (`Button`, `Card`, presence, …).    |
| `@anvilkit/utils`         | Zero-dependency leaf helpers (`deepMerge`, `invariant`, …).           |
| `@anvilkit/template-*`    | 10 seed page templates shipped with v1.0 (`packages/templates/`).     |
| `@anvilkit/create-plugin` | Scaffolder for `@anvilkit/*` StudioPlugin packages.                   |
| `@anvilkit/cli`           | The `anvilkit` CLI — `init`, `add`, `validate`, `export`, `generate`. |

### Plugins (`packages/plugins/`, git submodules)

| Plugin                             | Latest                 | Purpose                                                                 |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `@anvilkit/plugin-export-html`     | `1.0.0-beta.0`         | HTML exporter with the XSS / URL / CSS-injection hostile-input battery. |
| `@anvilkit/plugin-export-react`    | `1.0.0-beta.0`         | React `.tsx` / `.jsx` exporter with AST-snapshot contract.              |
| `@anvilkit/plugin-ai-copilot`      | `1.0.0-beta.0`         | Headless AI copilot; validator-gated dispatch; `./mock` for CI.         |
| `@anvilkit/plugin-asset-manager`   | `1.0.0`                | Headless asset uploads with CSP advisor + S3 presigned adapter.         |
| `@anvilkit/plugin-version-history` | `1.0.0-beta.0`         | Snapshot persistence via host `SnapshotAdapter`; diff/apply engine.     |
| `@anvilkit/plugin-collab-yjs`      | `0.9.0-rc.0` (`@beta`) | Yjs CRDT collaboration; opt-in native Y.Map tree.                       |
| `@anvilkit/collab-ui`              | `0.1.0-rc.0` (`@beta`) | Host UI primitives (room bar, presence layer) for the Yjs plugin.       |

### Apps (`apps/`)

| App         | Purpose                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `apps/demo` | Next.js validation surface for every published `@anvilkit/*` package.           |
| `apps/docs` | Starlight docs site deployed to [docs.anvilkit.dev](https://docs.anvilkit.dev). |

### Component packages

Eleven independently-published component packages live under the
`packages/components/` submodule:

`@anvilkit/button`, `@anvilkit/input`, `@anvilkit/navbar`, `@anvilkit/hero`,
`@anvilkit/section`, `@anvilkit/bento-grid`, `@anvilkit/blog-list`,
`@anvilkit/helps`, `@anvilkit/logo-clouds`, `@anvilkit/pricing-minimal`,
`@anvilkit/statistics`.

Each exports a render component plus `componentConfig`, `defaultProps`, `fields`, and `metadata`. See `packages/components/AGENTS.md` for component-authoring conventions.

## Demo App

The demo app is a validation surface, not a docs site.

- `/` is the demo hub
- `/puck/editor` runs the client editor flow
- `/puck/render` renders the same payload through `@puckeditor/core/rsc`

The shared Puck config lives in `apps/demo/lib/puck-demo.ts`. When adding a new component, update both `lib/puck-demo.ts` and `transpilePackages` in `apps/demo/next.config.js`.

## Git submodules

After cloning, run `git submodule update --init --recursive`. Submodules:

- `packages/components`
- `packages/plugins/plugin-ai-copilot`
- `packages/plugins/plugin-asset-manager`
- `packages/plugins/plugin-export-html`
- `packages/plugins/plugin-export-react`
- `packages/plugins/plugin-version-history`
- `packages/plugins/plugin-collab-yjs`
- `packages/plugins/plugin-collab-ui`

## Continuous Integration

`.github/workflows/ci.yml` runs on every pull request (pnpm 11.5.1 / Node 22, submodules pulled recursively):

1. `pnpm lint` — Biome lint
2. `pnpm typecheck` — TypeScript validation
3. `pnpm madge` — circular dependency scan
4. `pnpm test` — Vitest across packages
5. `pnpm build` — build every package
6. `pnpm turbo run docs:build` — Starlight build gate
7. `pnpm publint` — `package.json` exports validation
8. Per-package release gates (`check:all`) for core, ir, schema, validator, and the published plugins
9. Per-package gzip budgets via `size-limit`
10. Playwright suites — `apps/demo` (editor + plugin smoke) and `apps/docs` (playground)

The Vercel deploy for the docs site posts an independent GitHub check — it does not block CI, and CI does not block it.

## Architecture context

For the fuller package plan and dependency rules, see [docs/ai-context/anvilkit-architecture.md](docs/ai-context/anvilkit-architecture.md). For the live-collab design, see [docs/architecture/realtime-collab.md](docs/architecture/realtime-collab.md). For the export trust boundary, see [docs/security/plugin-trust-model.md](docs/security/plugin-trust-model.md).
