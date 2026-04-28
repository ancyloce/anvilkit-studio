# Contributing to AnvilKit Studio

Thanks for your interest in contributing to AnvilKit Studio. This guide covers everything you need to get started.

## Prerequisites

- **Node.js** >= 20.19
- **pnpm** 10.33.0 (exact — the repo enforces this via `packageManager`)
- **Git** with submodule support

Install pnpm if you don't have it:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

## Initial Setup

```bash
git clone --recurse-submodules <repo-url> anvilkit-studio
cd anvilkit-studio
pnpm install
pnpm build
```

If you already cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
pnpm install
```

Verify everything works:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Workspace Layout

```
anvilkit-studio/
├── apps/demo/                 # Next.js demo app (validation surface)
├── packages/
│   ├── core/                  # @anvilkit/core — runtime, plugin engine, React shell
│   ├── ir/                    # @anvilkit/ir — intermediate representation transforms
│   ├── schema/                # @anvilkit/schema — AI-friendly component schemas
│   ├── validator/             # @anvilkit/validator — export-readiness validation
│   ├── ui/                    # @anvilkit/ui — shared UI primitives
│   ├── utils/                 # @anvilkit/utils — zero-dependency helpers
│   ├── components/            # Git submodule — 11 @anvilkit/* component packages
│   ├── plugins/               # Git submodules (plugin-ai-copilot, plugin-export-html)
│   └── configs/               # Private config packages (biome, tailwind, typescript)
└── docs/                      # Architecture docs, plans, task specs
```

Each component under `packages/components/src/<slug>/` is an independently versioned and publishable npm package under the `@anvilkit/*` namespace.

For the full architecture, see [docs/ai-context/anvilkit-architecture.md](docs/ai-context/anvilkit-architecture.md).

## Dependency Rules

The workspace enforces a strict dependency DAG. Violations are caught by `pnpm madge` in CI.

**Forbidden edges:**

| Rule                                                                         | Rationale                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `@anvilkit/utils` has **zero** runtime dependencies                          | Leaf node of the DAG; any import is a bug                      |
| `@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator` never import React | These are isomorphic — they must run in Node and edge runtimes |
| `@anvilkit/ui` never imports `@anvilkit/core` or plugins                     | UI primitives are Studio-agnostic                              |
| `@anvilkit/core` never imports plugins                                       | The shell doesn't know the plugin set                          |
| No package imports an app                                                    | Data flows upward only                                         |

**Dependency direction** (each arrow means "depends on"):

```
apps/demo → plugins, components, core, ui
plugins   → core, ui, utils, schema, validator, ir
core      → ui, utils
schema    → utils
validator → utils, schema
ir        → utils
utils     → (nothing)
```

## Running Tests

```bash
# Run all tests (Vitest, via Turbo)
pnpm test

# Watch mode
pnpm test:watch

# Run Playwright E2E tests against the demo
pnpm --filter demo exec playwright install --with-deps chromium  # first time only
pnpm --filter demo e2e
```

## Running the Demo

```bash
pnpm --filter demo dev
```

Open [http://localhost:3000](http://localhost:3000). The demo has two Puck modes:

- `/puck/editor` — interactive page builder
- `/puck/render` — server-side render (RSC-compatible)

The shared Puck config lives in `apps/demo/lib/puck-demo.ts`.

## Changesets Workflow

Every PR that touches a published package **must** include a changeset.

```bash
pnpm changeset
```

This prompts you to select affected packages and describe the change. The generated `.changeset/*.md` file is committed with your PR. Maintainers run `pnpm changeset version` and `pnpm changeset publish` to cut releases.

**Do not** hand-edit `version` fields in `package.json` — Changesets manages all version bumps.

Release leads: see [`docs/release/release-runbook.md`](docs/release/release-runbook.md) for the `publish.yml` workflow modes, pre-flight checks, rollback procedure, and smoke verification.

## Marketplace Submission

Plugins, templates, and components published under a community npm scope can be listed in the AnvilKit marketplace. To submit:

1. Open a PR that adds a single entry to [`apps/docs/src/registry/feed.json`](apps/docs/src/registry/feed.json), matching the schema in [`apps/docs/src/registry/feed.schema.ts`](apps/docs/src/registry/feed.schema.ts).
2. Include in the PR description: the published npm version, a runnable `npx anvilkit add <slug>` snippet, and the resulting `puck-config.ts` diff.
3. CI runs `.github/workflows/marketplace-scorecard.yml` automatically. Failing the scorecard blocks merge.
4. A maintainer performs the manual review checklist in [`docs/policies/marketplace-governance.md`](docs/policies/marketplace-governance.md) §4 within 48 hours of the PR being opened.
5. On merge, the entry appears at [`/marketplace`](https://docs.anvilkit.dev/marketplace) on the next docs deploy.

For the full submission, review, and removal policy, see [`docs/policies/marketplace-governance.md`](docs/policies/marketplace-governance.md). For the feed format, see [`docs/policies/marketplace-feed.md`](docs/policies/marketplace-feed.md). For the trust boundary that the registry relies on, see [`docs/security/plugin-trust-model.md`](docs/security/plugin-trust-model.md).

## PR Expectations

Before opening a PR, confirm all of these pass locally:

```bash
pnpm lint        # Biome lint — zero warnings
pnpm typecheck   # TypeScript — zero errors
pnpm madge       # Circular dependency check — zero cycles
pnpm test        # Vitest — all green
pnpm build       # All packages build
pnpm publint     # package.json exports validation — all good
```

**Checklist:**

- Biome lint clean (`pnpm lint`)
- Types pass (`pnpm typecheck`)
- No circular dependencies (`pnpm madge`)
- Tests green (`pnpm test`)
- Build succeeds (`pnpm build`)
- publint clean (`pnpm publint`)
- One changeset per published-package change (`pnpm changeset`)
- Props must be serializable — no functions, refs, or class instances in `defaultProps` or field schemas
- Components must work on mobile, tablet, and desktop in both light and dark themes
- New or modified components must uphold the WCAG 2.1 AA baseline — see [`docs/a11y-baseline.md`](docs/a11y-baseline.md) for the per-component matrix, required semantics, and review checklist

## Scaffolding a New Component

Use the interactive generator inside the components workspace:

```bash
pnpm --filter anvilkit-components gen:component
```

Or with flags:

```bash
pnpm --filter anvilkit-components gen:component -- \
  --name <slug> \
  --label "Display Name" \
  --template <content|layout|form> \
  --category <slug>
```

After scaffolding:

1. Implement the render component in `src/<Slug>.tsx` and finalize `defaultProps`, `fields`, and metadata in `src/config.ts`
2. Wire `@anvilkit/ui` peer/dev deps and any needed CSS `@source` entries
3. Validate: `pnpm lint && pnpm typecheck && pnpm build`
4. Integrate into the demo: add import + config entry in `apps/demo/lib/puck-demo.ts` and the package name to `transpilePackages` in `apps/demo/next.config.js`
5. Create a changeset: `pnpm changeset`

Full component conventions are documented in `packages/components/AGENTS.md`.

## Submodule Workflow

Three directories are Git submodules:

- `packages/components`
- `packages/plugins/plugin-ai-copilot`
- `packages/plugins/plugin-export-html`

**Initialize after cloning:**

```bash
git submodule update --init --recursive
```

**Pull latest submodule changes:**

```bash
git submodule update --remote
```

After updating submodule pointers, commit the updated reference in the parent repo:

```bash
git add packages/components  # or whichever submodule changed
git commit -m "chore: update components submodule"
```

**Working inside a submodule:** Each submodule is its own Git repository. `cd` into the submodule directory to make commits, switch branches, or push. Changes inside a submodule don't automatically appear in the parent — you must commit the updated submodule pointer in the parent repo separately.
