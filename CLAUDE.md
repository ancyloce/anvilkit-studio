# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**anvilkit-studio** is a monorepo for independently publishable Puck-native React component packages. Components are built for [Puck](https://puckeditor.com/) (a headless page builder), each published separately under the `@anvilkit/*` namespace.

## Workflow & Interaction

- When asked for a **code review, analysis, audit, or roadmap**, start producing the deliverable immediately. Do NOT open plan-approval (`ExitPlanMode`) or ask scoping questions first — make reasonable scoping assumptions, state them inline, and only pause if the request is genuinely ambiguous or blocked.
- Default to autonomous, multi-file execution: chain related fixes in one pass, self-verify through the gates below, and report once when the work survives verification — not after each micro-step.
- Prefer a root-cause fix plus a regression test over a band-aid. When a first attempt fails verification, iterate rather than stopping to ask how to proceed.
- Track multi-finding work as numbered items (P0/P1/P2 or R1…/F1…) and drive each to closure.

## Monorepo Structure

```
anvilkit-studio/
├── apps/
│   ├── demo/               # Next.js demo app for validating components
│   └── docs/               # @anvilkit/docs-site — Fumadocs docs (TanStack Start + Vite, SSR)
├── bench/                  # tinybench perf harness (component/IR/export)
├── packages/
│   ├── analytics/          # Git submodules → @anvilkit/analytics-{core,react}
│   │   ├── core/           # @anvilkit/analytics-core — React-free adapters/catalog/transport
│   │   └── react/          # @anvilkit/analytics-react — AnalyticsProvider/useTrack
│   ├── cli/                # @anvilkit/cli — `anvilkit` CLI scaffold
│   ├── components/         # Git submodule → @anvilkit/* component packages
│   ├── core/               # @anvilkit/core — runtime, plugin engine, <Studio> shell
│   ├── ir/                 # @anvilkit/ir — Headless Page IR transforms
│   ├── schema/             # @anvilkit/schema — AI-friendly schema derivation
│   ├── validator/          # @anvilkit/validator — Puck Config validator
│   ├── ui/                 # @anvilkit/ui — shared UI primitives
│   ├── utils/              # @anvilkit/utils — shared helpers
│   ├── templates/          # @anvilkit/template-* — page template packages
│   ├── create-plugin/      # `@anvilkit/create-plugin` scaffolder
│   ├── configs/
│   │   ├── biome-config/
│   │   ├── tailwind-config/
│   │   ├── typescript-config/
│   │   └── vitest-config/
│   └── plugins/            # Git submodules (see Git Submodules below)
```

**Package manager**: pnpm 11.5.1 (strictly pinned). **Orchestration**: Turbo.

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
pnpm docs:dev     # Fumadocs (Vite) docs site dev server (apps/docs, port 4321)
pnpm docs:build   # Build the Fumadocs docs site
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
pnpm docs:dev     # Vite dev server (TanStack Start, port 4321) — also boots the collab relay
pnpm docs:build   # vite build → Nitro Build Output API at apps/docs/.vercel/output (SSR, deployed to Vercel)
pnpm typecheck    # fumadocs-mdx && tsc --noEmit
pnpm test         # vitest (registry + guide code-block tests)
pnpm e2e          # Docs playground Playwright spec
```

The docs site is a **Fumadocs + TanStack Start (Vite/Nitro)** SSR app. Content
lives under `content/docs/**` (MDX). Generators (`scripts/generate-*`) emit MDX
for component pages, the API reference, and template pages plus the marketplace
`registry/feed.json`; the generated trees (`content/docs/{components,api,templates}`)
are committed, so run `pnpm generate:all` after changing a component/plugin to
refresh them.

> **Deploy model.** Unlike the prior static Astro build, this app is SSR: Vercel's
> **Root Directory** must be set to `apps/docs` (it reads `apps/docs/vercel.json`
> and consumes the Nitro Build Output API at `apps/docs/.vercel/output`). There is
> no root `vercel.json`.

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
- Use Biome with tab indentation (not Prettier, which converts tabs to spaces) for all formatting in this repo
- TypeScript 6.0.2 at the workspace level; demo uses TS 5.9.2 for Next.js compatibility

### Continuous Integration

`.github/workflows/ci.yml` runs on every pull request: it checks out submodules recursively, sets up pnpm 11.5.1 / Node 22, then runs `pnpm lint`, `pnpm typecheck`, `pnpm madge` (circular dep gate), `pnpm test`, `pnpm build`, `pnpm turbo run docs:build` (Fumadocs/Vite build gate), `pnpm publint`, the `@anvilkit/core` release gates (`pnpm --filter @anvilkit/core check:all`), the Phase 3 release gates for `ir`/`schema`/`validator`/`plugin-export-html`/`plugin-export-react`/`plugin-ai-copilot`, per-package gzip budgets via `size-limit`, and two Playwright suites — the demo E2E (`apps/demo`) and the docs playground E2E (`apps/docs`).

Other workflows: `publish.yml`, `bench.yml`, `size.yml`, `generator-smoke.yml`, `templates-smoke.yml`. The Vercel deploy of the docs site runs from `apps/docs/vercel.json` (Vercel Root Directory = `apps/docs`) and posts an independent GitHub check — it does not block CI, and CI does not block it.

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

Submodules (16 total — the canonical source is `.gitmodules`; run
`git config -f .gitmodules --get-regexp path` rather than trusting this list):

- `packages/components`
- Plugins under `packages/plugins/`:
  - `plugin-ai-copilot`
  - `plugin-ai-image`
  - `plugin-asset-manager`
  - `plugin-canvas-studio`
  - `plugin-collab-ui`
  - `plugin-collab-yjs`
  - `plugin-design-system`
  - `plugin-export-canvas`
  - `plugin-export-html`
  - `plugin-export-react`
  - `plugin-version-history`
- Canvas (direct submodules — `packages/canvas` is a plain directory, not itself a submodule):
  - `packages/canvas/core`
  - `packages/canvas/editor`
- Analytics (direct submodules — `packages/analytics` is a plain directory, not itself a submodule):
  - `packages/analytics/core` (`@anvilkit/analytics-core`)
  - `packages/analytics/react` (`@anvilkit/analytics-react`)

### Submodule convention (REQUIRED for all new modules)

**Every new module — plugins AND standalone packages — is added as a git
submodule, not an in-tree package.** Group related submodules under a plain
parent directory (`packages/plugins/`, `packages/canvas/`, `packages/analytics/`)
that is itself a normal directory, and register each child in `.gitmodules` +
the matching `pnpm-workspace.yaml` glob (`packages/<group>/*`).

To promote a scaffolded package to a submodule (the maintainer's step — needs a
remote repo):

```bash
# 1. Create the GitHub repo (e.g. github.com/ancyloce/anvilkit-<name>), push the
#    package content to it, then in the superproject:
git submodule add https://github.com/ancyloce/anvilkit-<name>.git packages/<group>/<name>
# 2. Add "packages/<group>/*" to pnpm-workspace.yaml if the group is new.
git config -f .gitmodules --get-regexp path   # verify
```

Editing submodule content does **not** show in the superproject's `git status` —
work inside the submodule's own working tree, commit there, then bump the
gitlink in the superproject (see the canvas/collab submodule memory notes).

## Health Stack

- typecheck: pnpm typecheck
- lint: pnpm lint
- test: pnpm test
- madge: pnpm madge (circular dependency detection)
- publint: pnpm publint (package.json exports validation)

knip and shellcheck are intentionally skipped: neither is installed in this repo,
and the only `.sh` files live under `node_modules/`. Reintroduce them here if that
ever changes.

## Verification Gates

- Always run typecheck, lint, and tests after multi-file changes
- When tests fail due to pre-existing infrastructure issues (path aliases, missing dist folders), report this clearly rather than skipping verification
- Build dependent packages (`pnpm build`) before assuming module resolution errors are code issues
- Always rebuild the affected package's dist (e.g. `pnpm build`) before declaring a fix complete; unit tests passing is NOT sufficient verification when a running demo/browser executes built code

## Code Review

- When asked for a detailed analysis or code review, deliver it directly rather than pausing to ask scope-clarifying questions; only ask if a hard blocker prevents progress
- After every code review, run the actual gates (typecheck, lint, tests, build, E2E) and adversarially verify findings against source before reporting them as confirmed

## Demo & Mount Consistency

- When wiring new props or plugins to Studio components, search for ALL <Studio> mounts in the demo (e.g., default and collab paths) and wire each one
- After UI/prop changes, grep for component usage across demo/ before declaring done

## Sub-agent usage

- Before refactoring a component or threading new props/plugins, spawn an Explore sub-agent to enumerate every call site (file:line) and report wiring status — do not start editing until the enumeration is complete
- Use sub-agents for parallel exploration when investigating across plugin packages or submodules (e.g., "find every adapter that implements X" across packages/plugins/\*); keep the main context focused on synthesis and edits
- Do not delegate the actual edits — sub-agents enumerate and report, the main agent decides and writes

## Safe Deletion

- Before deleting any file, grep the repo for inbound references (imports, paths in JSON/MD, test fixtures). Present a deletion list with reference counts; wait for my approval before any rm.

## Iframe & Canvas Styling

- Tailwind utilities and parent-document CSS do NOT reach the canvas iframe — use inline styles or explicit CopyHostStyles injection
- Before debugging styling issues, suspect stale webpack/dev-server cache and check with a clean rebuild

## TypeScript Conventions

- Use `import type` for type-only imports (verbatimModuleSyntax is enforced)
- Watch for circular dependencies; prefer inlining small type references over cross-module imports when cycles form

## i18n Convention

- Never duplicate bilingual strings inline; always use i18n message keys
- Do not add language-specific (e.g., Chinese) translation overrides to demo apps unless explicitly requested

## Test Infrastructure Notes

- E2E tests must use unique room IDs per test and avoid port 1234 collisions (use dynamic ports or kill stale processes first)
- The repo has known path-alias resolution issues in some test suites — flag this rather than silently skipping tests

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
