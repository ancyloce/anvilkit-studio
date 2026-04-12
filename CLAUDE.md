# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**anvilkit-studio** is a monorepo for independently publishable Puck-native React component packages. Components are built for [Puck](https://puckeditor.com/) (a headless page builder), each published separately under the `@anvilkit/*` namespace.

## Monorepo Structure

```
anvilkit-studio/
├── apps/demo/              # Next.js demo app for validating components
├── packages/
│   ├── components/         # Git submodule → @anvilkit/* component packages
│   ├── ui/                 # @anvilkit/ui — shared UI primitives
│   ├── configs/
│   │   ├── biome-config/   # Shared Biome lint/format config
│   │   ├── tailwind-config/# Shared Tailwind + shadcn tokens
│   │   └── typescript-config/
│   └── plugins/            # Git submodules (plugin-ai-copilot, plugin-export-html)
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
```

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

Both share `apps/demo/lib/puck-demo.ts`, which composes the Puck `Config` from each imported component package. As of April 2026, 9 of the 11 published component packages are wired here — `@anvilkit/button` and `@anvilkit/input` are published but not yet integrated into the demo. When adding a new component to the demo, update this file and `apps/demo/next.config.js` (`transpilePackages`).

### Styling
- **Tailwind CSS 4** (`tailwindcss` 4.2.2 via `@tailwindcss/postcss`) — consumers import shared tokens with `@import "@anvilkit/tailwind-config/shadcn"` (CSS-first config, no `tailwind.config.js`)
- shadcn-style CSS variable tokens (light/dark mode)
- All components must be responsive (mobile/tablet/desktop) and theme-aware

### Linting & Formatting
- **Biome** handles both lint and format across all packages
- **Prettier** is used at root level for `.ts/.tsx/.md` files
- TypeScript 6.0.2 at the workspace level; demo uses TS 5.9.2 for Next.js compatibility

### Continuous Integration
`.github/workflows/ci.yml` runs on every pull request: it checks out submodules recursively, sets up pnpm 10.33.0 / Node 20, then runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. A separate `publish-ui.yml` workflow exists for the `@anvilkit/ui` package.

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

Submodules: `packages/components`, `packages/plugins/plugin-ai-copilot`, `packages/plugins/plugin-export-html`

## Health Stack

- typecheck: pnpm typecheck
- lint: pnpm lint
- test: pnpm test

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
