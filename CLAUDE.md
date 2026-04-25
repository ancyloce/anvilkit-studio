# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**anvilkit-studio** is a monorepo for independently publishable Puck-native React component packages. Components are built for [Puck](https://puckeditor.com/) (a headless page builder), each published separately under the `@anvilkit/*` namespace.

## Monorepo Structure

```
anvilkit-studio/
├── apps/
│   ├── demo/               # Next.js demo app for validating components
│   ├── docs/               # @anvilkit/docs-site — Starlight docs (Astro)
│   └── cli/                # `anvilkit` CLI scaffold
├── bench/                  # tinybench perf harness (component/IR/export)
├── packages/
│   ├── components/         # Git submodule → @anvilkit/* component packages
│   ├── core/               # @anvilkit/core — runtime, plugin engine, <Studio> shell
│   ├── ir/                 # @anvilkit/ir — Headless Page IR transforms
│   ├── schema/             # @anvilkit/schema — AI-friendly schema derivation
│   ├── validator/          # @anvilkit/validator — Puck Config validator
│   ├── ui/                 # @anvilkit/ui — shared UI primitives
│   ├── utils/              # @anvilkit/utils — shared helpers
│   ├── templates/          # @anvilkit/template-* — page template packages
│   ├── create-plugin/      # `create-anvilkit-plugin` scaffolder
│   ├── configs/
│   │   ├── biome-config/
│   │   ├── tailwind-config/
│   │   ├── typescript-config/
│   │   └── vitest-config/
│   └── plugins/            # Git submodules (see Git Submodules below)
```

**Package manager**: pnpm 10.33.0 (strictly pinned). **Orchestration**: Turbo.

`packages/components` is a git submodule with its own pnpm workspace. Each component under `packages/components/src/<slug>/` is an independently versioned and publishable package.

## Commands

### Root workspace
```bash
pnpm dev          # Turbo watch mode for all packages
pnpm build        # Build all packages
pnpm lint         # Biome lint
pnpm format       # Prettier format (TS/TSX/MD)
pnpm typecheck    # TypeScript type checking across workspace
pnpm test         # Run Vitest across every workspace package (via Turbo cache)
pnpm madge        # Circular dependency scan (packages/, ts+tsx)
pnpm publint      # Validate package.json exports across publishable packages
pnpm size         # size-limit gzip budgets per publishable package
pnpm bench        # Run tinybench perf harness against ./bench/baseline.json
pnpm bench:update # Re-record bench baselines
pnpm docs:dev     # Starlight docs site dev server (apps/docs, port 4321)
pnpm docs:build   # Build the Starlight docs site
```

### Components workspace (`packages/components/`)
```bash
pnpm dev          # Watch mode (Rslib)
pnpm build        # Build all component packages
pnpm lint         # Biome lint
pnpm format       # Biome format
pnpm typecheck    # TypeScript validation

# Scaffold a new component (interactive)
pnpm gen:component
# Or with flags:
pnpm gen:component -- --name <slug> --label "Display Name" --template <content|layout|form> [--category <slug>]

# Publishing
pnpm changeset    # Create a changeset for versioning
pnpm release      # Version + build + publish to npm
```

### Demo app (`apps/demo/`)
```bash
pnpm dev          # Next.js dev server (port 3000)
pnpm build        # Production build
pnpm lint         # Biome lint
pnpm typecheck    # next typegen + tsc
pnpm e2e          # Playwright E2E (smoke + export + AI copilot specs)
pnpm e2e:install  # One-time: install Chromium for Playwright
```

### Docs site (`apps/docs/` — `@anvilkit/docs-site`)
```bash
pnpm docs:dev     # Astro dev server (port 4321) — runs generate:all first
pnpm docs:build   # Astro build → apps/docs/dist (deployed to Vercel)
pnpm typecheck    # astro check
pnpm e2e          # Docs playground Playwright spec
```
Generators (`scripts/generate-*`) emit MDX for component pages, API
references, and template pages before every build.

## Key Architecture Decisions

### Component Publishing Model
- Each component is its own npm package (`@anvilkit/<slug>`), versioned independently via Changesets.
- No umbrella package — consumers install only what they need.
- Built with **Rslib** (Rust bundler) → outputs CJS + ESM + `.d.ts` types.

### Puck Component Contract
Each component package must export:
- `componentConfig: ComponentConfig` — the Puck config object (fields, defaultProps, render)
- `defaultProps` — serializable default values
- `fields` — Puck field definitions
- `metadata` — display label, description, category, icon

The render component must accept only serializable props (no functions, no refs at the top level).

### Demo App Integration
The demo validates components via two Puck modes:
- `/puck/editor` — interactive builder
- `/puck/render` — server-side render (RSC-compatible)

Both share `apps/demo/lib/puck-demo.ts`, which composes the Puck `Config` from each imported component package. All 11 published component packages are currently wired here. When adding a new component to the demo, update this file and `apps/demo/next.config.js` (`transpilePackages`).

### Styling
- **Tailwind CSS 4** (`tailwindcss` 4.2.2 via `@tailwindcss/postcss`) — consumers import shared tokens with `@import "@anvilkit/tailwind-config/shadcn"` (CSS-first config, no `tailwind.config.js`)
- shadcn-style CSS variable tokens (light/dark mode)
- All components must be responsive (mobile/tablet/desktop) and theme-aware

### Linting & Formatting
- **Biome** handles both lint and format across all packages
- **Prettier** is used at root level for `.ts/.tsx/.md` files
- TypeScript 6.0.2 at the workspace level; demo uses TS 5.9.2 for Next.js compatibility

### Continuous Integration
`.github/workflows/ci.yml` runs on every pull request: it checks out submodules recursively, sets up pnpm 10.33.0 / Node 20, then runs `pnpm lint`, `pnpm typecheck`, `pnpm madge` (circular dep gate), `pnpm test`, `pnpm build`, `pnpm turbo run docs:build` (Starlight build gate), `pnpm publint`, the `@anvilkit/core` release gates (`pnpm --filter @anvilkit/core check:all`), the Phase 3 release gates for `ir`/`schema`/`validator`/`plugin-export-html`/`plugin-export-react`/`plugin-ai-copilot`, per-package gzip budgets via `size-limit`, and two Playwright suites — the demo E2E (`apps/demo`) and the docs playground E2E (`apps/docs`).

Other workflows: `publish.yml`, `publish-ui.yml`, `bench.yml`, `size.yml`, `generator-smoke.yml`, `templates-smoke.yml`. The Vercel deploy of the docs site runs from `vercel.json` and posts an independent GitHub check — it does not block CI, and CI does not block it.

**Typecheck script naming:** the workspace normalizes on `typecheck` (not `check-types`) across every package and the Turbo task graph. The components submodule (`packages/components/`) already used `typecheck` for each component package, so the root and direct-workspace packages (`ui`, `utils`, `vitest-config`, `apps/demo`) were renamed to match. Do not reintroduce `check-types`.

## Adding a New Component

1. Run `pnpm gen:component` in `packages/components/` — prompts for slug, label, template, category
2. Implement `src/<Slug>.tsx` (render), `src/config.ts` (Puck config), `src/index.ts` (exports)
3. Validate: `pnpm lint && pnpm typecheck && pnpm build`
4. Integrate into demo: add import + config entry in `apps/demo/lib/puck-demo.ts` and the package name to `transpilePackages` in `apps/demo/next.config.js`
5. Create changeset: `pnpm changeset` then `pnpm release`

Full component rules and conventions are documented in `packages/components/AGENTS.md`.

## Git Submodules

```bash
git submodule update --init --recursive  # Initialize after cloning
```

Submodules:
- `packages/components`
- `packages/plugins/plugin-ai-copilot`
- `packages/plugins/plugin-asset-manager`
- `packages/plugins/plugin-export-html`
- `packages/plugins/plugin-export-react`
- `packages/plugins/plugin-version-history`

## Health Stack

- typecheck: pnpm typecheck
- lint: pnpm lint
- test: pnpm test
- madge: pnpm madge (circular dependency detection)
- publint: pnpm publint (package.json exports validation)

knip and shellcheck are intentionally skipped: neither is installed in this repo,
and the only `.sh` files live under `node_modules/`. Reintroduce them here if that
ever changes.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
