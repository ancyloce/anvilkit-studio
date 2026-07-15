# Contributing to AnvilKit Studio

Thanks for your interest in contributing to AnvilKit Studio. This guide covers everything you need to get started.

## Prerequisites

- **Node.js** >= 22.13
- **pnpm** 11.13.0 (exact — the repo enforces this via `packageManager`)
- **Git** with submodule support

Install pnpm if you don't have it:

```bash
corepack enable
corepack prepare pnpm@11.13.0 --activate
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

## Migration Guides

Upgrading between AnvilKit versions? Each release has a dedicated
guide enumerating additive surfaces, behavioural fixes, and any
required code changes. The current guides:

- [`docs/migration/0.x-to-1.0-beta.md`](docs/migration/0.x-to-1.0-beta.md)
  — `0.1.0-alpha.x` → `1.0.0-beta`.
- [`docs/migration/1.0-beta-to-1.0.md`](docs/migration/1.0-beta-to-1.0.md)
  — `1.0.0-beta` → `1.0.0` GA.
- [`docs/migration/1.0-to-1.1.md`](docs/migration/1.0-to-1.1.md)
  — `1.0.0` → `1.1.0` GA (purely additive).

Long-term support guarantees and the per-channel patch windows live
in [`docs/policies/lts.md`](docs/policies/lts.md).

## Workspace Layout

The current physical tree and the phased target are intentionally documented separately. Before adding or moving a workspace, read the [canonical repository architecture](docs/architecture/repository-structure.md). It defines the `apps -> extensions -> capabilities -> runtime -> foundation` dependency direction, app responsibilities, package placement, and submodule policy. Physical path changes must preserve public npm names and exports.

The current `apps/studio` is a full product-grade reference implementation and will become `apps/studio`. A future `apps/playground` will own minimal package compatibility tests. `apps/docs` remains the Fumadocs/TanStack Start documentation and marketplace application.

## Dependency Rules

`pnpm madge` detects circular imports but does not enforce every architectural edge. Contributors must follow the [canonical dependency rules](docs/architecture/repository-structure.md#architecture-layers): lower layers never import higher layers, runtime never imports capabilities/extensions, packages never import apps, and extensions integrate through public exports rather than private source paths. Workspace-wide boundary automation is planned separately.

## Running Tests

```bash
# Run all tests (Vitest, via Turbo)
pnpm test

# Watch mode
pnpm test:watch

# Run Playwright E2E tests against the studio app
pnpm --filter studio exec playwright install --with-deps chromium  # first time only
pnpm --filter studio e2e
```

## Running the Reference App

```bash
pnpm --filter studio dev
```

Open [http://localhost:3000](http://localhost:3000). The current reference app has two Puck modes:

- `/puck/editor` — interactive page builder
- `/puck/render` — server-side render (RSC-compatible)

The shared Puck config lives in `apps/studio/lib/puck-demo.ts`.

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

1. Open a PR that adds a single entry to [`apps/docs/src/registry/feed.json`](apps/docs/src/registry/feed.json), matching the schema in [`apps/docs/src/registry/feed.schema.mjs`](apps/docs/src/registry/feed.schema.mjs).
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
4. Integrate into the current reference app: add import + config entry in `apps/studio/lib/puck-demo.ts` and the package name to `transpilePackages` in `apps/studio/next.config.js`
5. Create a changeset: `pnpm changeset`

Full component conventions are documented in `packages/extensions/components/AGENTS.md`.

## Submodule Workflow

`.gitmodules` is the canonical inventory. List current paths instead of relying on a copied count:

```bash
git config -f .gitmodules --get-regexp path
```

Do not create a submodule by default. Use the [lifecycle and ownership policy](docs/architecture/repository-structure.md#submodule-policy) before separating a package.

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
git add packages/extensions/components  # or whichever submodule changed
git commit -m "chore: update components submodule"
```

**Working inside a submodule:** Each submodule is its own Git repository. `cd` into the submodule directory to make commits, switch branches, or push. Changes inside a submodule don't automatically appear in the parent — you must commit the updated submodule pointer in the parent repo separately.
