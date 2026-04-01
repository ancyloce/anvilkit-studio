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
pnpm check-types  # TypeScript type checking across workspace
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
pnpm check-types  # next typegen + tsc
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
The demo validates all components via two Puck modes:
- `/puck/editor` — interactive builder
- `/puck/render` — server-side render (RSC-compatible)

Both share `apps/demo/lib/puck-demo.ts`, which composes the Puck `Config` from all component imports. When adding a new component to the demo, update this file and `apps/demo/next.config.js` (`transpilePackages`).

### Styling
- **Tailwind CSS 3** with shared tokens from `@anvilkit/tailwind-config/base.js`
- shadcn-style CSS variable tokens (light/dark mode)
- All components must be responsive (mobile/tablet/desktop) and theme-aware

### Linting & Formatting
- **Biome** handles both lint and format across all packages
- **Prettier** is used at root level for `.ts/.tsx/.md` files
- TypeScript 6.x at the workspace level; demo uses TS 5.9.x for Next.js compatibility

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
