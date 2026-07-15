# AnvilKit Studio

AnvilKit Studio is AnvilKit's frontend SDK, [Puck](https://puckeditor.com/)-native Studio runtime, extension ecosystem, reference product, documentation and marketplace application, integration suite, and frontend developer-tooling repository. Public packages retain independent `@anvilkit/*` names even when their releases are coordinated.

> **AnvilKit Studio is in pre-1.0 beta.** Changesets coordinates the runtime package group and selected plugins; other packages retain independent version lines. See the [aggregate changelog](CHANGELOG.md), the [migration guide](docs/migration/0.x-to-1.0-beta.md), or [file beta feedback](docs/beta-feedback/README.md).
>
> **Looking ahead:** the [LTS policy](docs/policies/lts.md) and the [`beta → 1.0` migration notes](docs/migration/1.0-beta-to-1.0.md) take effect on the day `v1.0.0` ships.

## Key features

- **Puck-native Studio runtime** — `@anvilkit/core` provides the editor shell, plugin lifecycle, and config-centric i18n (en/zh/ja/ko) on top of `@puckeditor/core`.
- **Extension ecosystem** — 12 independently published component packages (hero, navbar, pricing, blog, statistics, …), 12 Studio plugins (AI copilot, AI image, asset manager, canvas studio, collaboration UI + Yjs transport, design system, HTML/React/canvas export, page SEO, version history), and page/canvas template packages.
- **Canvas capability** — `@anvilkit/canvas-core` (IR, geometry, hit-testing, snapping, extension registries) plus `@anvilkit/canvas-editor` (React editing shell).
- **Analytics capability** — `analytics/core` and `analytics/react` behind a port boundary so the runtime stays decoupled.
- **Realtime collaboration** — Yjs-based plugins with a standalone Dockerized Hocuspocus relay (`apps/collab`).
- **Foundation layer** — shared contracts, Page IR, schema derivation, validation, and React-free utilities.
- **Reference product, playground, and docs** — a product-grade Studio app, a minimal package-compatibility playground, and a Fumadocs docs + marketplace site.
- **Developer tooling** — `@anvilkit/cli`, `@anvilkit/create-plugin`, and shared Biome/Tailwind/TypeScript/Vitest configs.

## Quick start

Requires Node >= 22.13 and pnpm 11.13.0 (pinned via `packageManager`).

```bash
git clone <repo-url>
cd anvilkit-studio
git submodule update --init --recursive
pnpm install
pnpm --filter studio dev
```

Open `http://localhost:3000`. The studio `dev` script supervises a local collaboration relay alongside `next dev`; use `pnpm --filter studio dev:next-only` to skip the relay.

Other entry points:

- `pnpm --filter playground dev` — minimal package-compatibility app on port 3100
- `pnpm docs:dev` — Fumadocs docs + marketplace site on port 4321

Useful root commands:

- `pnpm dev` — Turbo watch mode across every package
- `pnpm build` — build all packages
- `pnpm lint` / `pnpm format` — Biome (tab indentation; Prettier is not used)
- `pnpm typecheck` — TypeScript across the workspace
- `pnpm test` — Vitest across the workspace
- `pnpm madge` — circular dependency scan
- `pnpm publint` — validate `package.json` exports
- `pnpm size` — per-package gzip budgets via `size-limit`
- `pnpm check:all` — per-package release gates (publint, circular deps, peer deps, bundle budget, API snapshot)
- `pnpm check:submodules` — validate `.gitmodules` against the retained-submodule contract

## Project structure

```text
apps/
  studio/       Product-grade reference app (Next.js 16)
  playground/   Minimal package-compatibility app (Next.js 16; public @anvilkit/* exports only)
  docs/         Docs + marketplace site (Fumadocs on TanStack Start/Vite)
  collab/       Standalone Dockerized Hocuspocus relay — outside the pnpm workspace,
                pending extraction to anvilkit-platform
packages/
  foundation/   contracts, ir, schema, validator, utils
  runtime/      core (Studio runtime), ui (shared React primitives)
  capabilities/ analytics/{core,react}, canvas/{core,editor}
  extensions/   components (12 packages), plugins (12 packages), templates
  tooling/      cli, create-plugin, configs (biome, tailwind, typescript, vitest)
scripts/        Submodule contract validation, npm pre-publish guard, codemods
.githooks/      pre-commit (react-doctor) and pre-push (check:all) gates
.github/        CI/CD workflows
```

The product dependency graph is strictly top-down: `apps → extensions → capabilities → runtime → foundation`. Repository tooling sits outside this graph, and packages never import applications.

See the [canonical repository architecture](docs/architecture/repository-structure.md) for verified current and target maps, package classifications, dependency rules, app roles, and placement policy. See `packages/extensions/components/AGENTS.md` for component-authoring conventions.

## Technology stack

| Area | Choice |
| --- | --- |
| Language | TypeScript 7.0.2 (`verbatimModuleSyntax` enforced) |
| UI | React 19, Puck (`@puckeditor/core` 0.22) |
| Apps | Next.js 16 (studio, playground); TanStack Start + Vite + Fumadocs (docs) |
| Styling | Tailwind CSS 4, CSS-first, via shared `@anvilkit/tailwind-config` |
| State & data | Zustand 5, Zod 4, Yjs 13 + Hocuspocus (collab) |
| Workspace | pnpm 11.13.0 + Turborepo 2 |
| Package builds | Rslib |
| Quality gates | Biome 2 (lint + format, tabs), Vitest 4, Playwright, madge, publint, size-limit |
| Releases | Changesets |

## Git submodules

The workspace embeds 17 git submodules: the components workspace (`packages/extensions/components`), all 12 plugin packages under `packages/extensions/plugins/`, `packages/capabilities/canvas/{core,editor}`, and `packages/capabilities/analytics/{core,react}`. After cloning, run `git submodule update --init --recursive`.

`.gitmodules` is the canonical inventory; inspect it with `git config -f .gitmodules --get-regexp path`, and validate it with `pnpm check:submodules` (checks every entry against `scripts/submodule-contract.json`). New packages remain in the monorepo by default unless independent ownership, access, release, or operational requirements justify separation. The full decision policy and retained-submodule contract are in the [canonical repository architecture](docs/architecture/repository-structure.md#submodule-policy).

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request (pnpm 11.13.0 / Node 22, submodules pulled recursively) and is split into path-aware jobs so changes scoped to a single leaf app skip unrelated work:

- **changes** — classifies changed paths (`dorny/paths-filter`) and gates the jobs below
- **validate** — `pnpm lint`, `pnpm typecheck`, `pnpm madge`, `pnpm test`, `pnpm build`
- **package-gates** — `pnpm build`, `pnpm publint`, `pnpm check:all` (per-package release gates)
- **studio-e2e / playground-e2e** — Playwright suites with uploaded reports
- **docs** — `pnpm turbo run docs:build` plus the docs Playwright suite

Supporting workflows: `size.yml` (gzip budgets), `react-doctor.yml` (React diagnostics), `clean-clone.yml` (clone/install topology validation), `generator-smoke.yml` (weekly generator smoke test), `marketplace-scorecard.yml` (PR + weekly marketplace validation), `publish.yml` (release publishing), and `docker-images.yml` (GHCR images).

Locally, `pnpm prepare` points `core.hooksPath` at `.githooks/`: pre-commit runs a react-doctor scan on staged files, and pre-push runs `check:all` for workspace packages changed against `origin/main`.

The Vercel deploy for the docs site posts an independent GitHub check — it does not block CI, and CI does not block it.

## Architecture context

For the authoritative package plan and dependency rules, see [docs/architecture/repository-structure.md](docs/architecture/repository-structure.md). For the live-collab design, see [docs/architecture/realtime-collab.md](docs/architecture/realtime-collab.md). For the export trust boundary, see [docs/security/plugin-trust-model.md](docs/security/plugin-trust-model.md).
