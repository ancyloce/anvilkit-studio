# AnvilKit Studio

AnvilKit Studio is a monorepo of [Puck](https://puckeditor.com/)-native React component packages, a Studio runtime, and a plugin ecosystem. Components, plugins, and templates are each published as independent `@anvilkit/*` npm packages.

> **AnvilKit Studio is in pre-1.0 beta.** Each package versions independently: the runtime cone (`@anvilkit/core`, `ir`, `schema`, `validator`, `ui`, `utils`) is on the `0.1.x` line, component packages are on their own `0.2.x` cadence, and the first-party plugins range from `0.1.x` to release-candidate lines (e.g. `@anvilkit/plugin-collab-yjs` and `@anvilkit/plugin-design-system`). See the [aggregate changelog](CHANGELOG.md), the [migration guide](docs/migration/0.x-to-1.0-beta.md), or [file beta feedback](docs/beta-feedback/README.md).
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
| `@anvilkit/contracts`     | Shared type-only contracts (Page IR, AI DTOs, export, pages).         |
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

| Plugin                             | Latest         | Purpose                                                                       |
| ---------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `@anvilkit/plugin-export-html`     | `0.1.8`        | HTML exporter with the XSS / URL / CSS-injection hostile-input battery.       |
| `@anvilkit/plugin-export-react`    | `0.1.6`        | React `.tsx` / `.jsx` exporter that emits source from the Page IR.            |
| `@anvilkit/plugin-export-canvas`   | `0.1.0-rc.2`   | Canvas export formats (PNG / JSON / SVG / PDF) over the canvas serializers.   |
| `@anvilkit/plugin-ai-copilot`      | `0.1.8`        | Headless AI copilot; validator-gated dispatch; `./mock` for CI.              |
| `@anvilkit/plugin-ai-image`        | `0.1.4`        | AI image generation (text-to-image, variation, inpaint, background removal). |
| `@anvilkit/plugin-asset-manager`   | `0.1.11`        | Headless asset uploads with optional React UI + presigned adapter.           |
| `@anvilkit/plugin-version-history` | `0.1.8`        | Snapshot persistence via host `SnapshotAdapter`; diff/apply engine.          |
| `@anvilkit/plugin-design-system`   | `0.1.1-rc.2`   | Token-bound fields, theme switching, and design validation.                  |
| `@anvilkit/plugin-canvas-studio`   | `0.1.6`        | Canvas Studio integration — mode-switch, design-block + `design://` bridge.  |
| `@anvilkit/plugin-page-seo`        | `0.1.0`        | Rail panel that edits a page's SEO metadata (`root.props.seo`).              |
| `@anvilkit/plugin-collab-yjs`      | `0.10.0-rc.10`  | Yjs CRDT collaboration; native per-node Y.Map tree (now default).           |
| `@anvilkit/collab-ui`              | `0.1.0-rc.10`   | Host UI primitives (room bar, presence layer) for the Yjs plugin.            |

### Canvas & analytics (`packages/canvas/`, `packages/analytics/`, git submodules)

| Package                    | Role                                                                        |
| -------------------------- | -------------------------------------------------------------------------- |
| `@anvilkit/canvas-core`    | Headless Canvas IR, Zod validators, walkers, mutations, serializers (no React/Konva). |
| `@anvilkit/canvas-editor`  | React + Konva editor UI; loads inside `<Studio>` via `next/dynamic({ ssr: false })`.  |
| `@anvilkit/analytics-core` | Framework-agnostic, React-free analytics adapters, event catalog, transport. |
| `@anvilkit/analytics-react`| `AnalyticsProvider` / `useAnalytics` / `useTrack` React bindings.           |

### Apps (`apps/`)

| App           | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `apps/demo`   | Next.js validation surface for every published `@anvilkit/*` package.           |
| `apps/docs`   | Starlight docs site deployed to [docs.anvilkit.dev](https://docs.anvilkit.dev). |
| `apps/collab` | Standalone Hocuspocus WebSocket relay for the docs playground (`?collab=1`); excluded from the pnpm workspace, deployed independently. |

### Component packages

Twelve independently-published component packages live under the
`packages/components/` submodule:

`@anvilkit/button`, `@anvilkit/input`, `@anvilkit/navbar`, `@anvilkit/hero`,
`@anvilkit/section`, `@anvilkit/bento-grid`, `@anvilkit/blog-list`,
`@anvilkit/design-block`, `@anvilkit/helps`, `@anvilkit/logo-clouds`,
`@anvilkit/pricing-minimal`, `@anvilkit/statistics`.

Each exports a render component plus `componentConfig`, `defaultProps`, `fields`, and `metadata`. See `packages/components/AGENTS.md` for component-authoring conventions.

## Demo App

The demo app is a validation surface, not a docs site.

- `/` is the demo hub
- `/puck/editor` runs the client editor flow
- `/puck/render` renders the same payload through `@puckeditor/core/rsc`

The shared Puck config lives in `apps/demo/lib/puck-demo.ts`. When adding a new component, update both `lib/puck-demo.ts` and `transpilePackages` in `apps/demo/next.config.js`.

## Git submodules

After cloning, run `git submodule update --init --recursive`. The canonical list
is `.gitmodules` (`git config -f .gitmodules --get-regexp path`). There are 17
submodules:

- `packages/components`
- Plugins (`packages/plugins/`): `plugin-ai-copilot`, `plugin-ai-image`,
  `plugin-asset-manager`, `plugin-canvas-studio`, `plugin-collab-ui`,
  `plugin-collab-yjs`, `plugin-design-system`, `plugin-export-canvas`,
  `plugin-export-html`, `plugin-export-react`, `plugin-page-seo`,
  `plugin-version-history`
- Canvas (`packages/canvas/`): `core`, `editor`
- Analytics (`packages/analytics/`): `core`, `react`

## Continuous Integration

`.github/workflows/ci.yml` runs on every pull request (pnpm 11.10.0 / Node 22, submodules pulled recursively):

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
