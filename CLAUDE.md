# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Hard Rules

- **Git is read-only for Claude. Automatic commits are disabled** — in the superproject and in every submodule. Never stage, commit, amend, rebase, merge, reset, clean, tag, push, switch branches, or open PRs on your own initiative. Details in Git & Submodules.
- **Formatting is Biome with TAB indentation.** Never run Prettier (the root `pnpm format` script invokes Prettier — don't use it), and never let formatter hooks convert tabs to spaces or introduce CRLF line endings.
- **UI work always uses the shared `@anvilkit/ui` primitives** — never hand-roll native `<select>`, bespoke CSS, or custom components when a primitive exists.
- **Every new module — plugins AND standalone packages — is a git submodule**, never an in-tree package (see Git & Submodules).
- Never reintroduce `check-types`: the workspace normalizes on `typecheck` across every package and the Turbo task graph.
- Never overwrite existing plan/report files — check for them and back up before writing.
- Never weaken tests or gates to get green; report pre-existing failures instead of skipping verification.

## Project Overview

**anvilkit-studio** is a monorepo for independently publishable Puck-native React component packages, built for [Puck](https://puckeditor.com/) (a headless page builder) and published separately under the `@anvilkit/*` namespace.

## Monorepo Structure

```
anvilkit-studio/
├── apps/
│   ├── demo/               # Next.js demo app for validating components
│   └── docs/               # @anvilkit/docs-site — Fumadocs docs (TanStack Start + Vite, SSR)
├── bench/                  # tinybench perf harness (component/IR/export)
├── packages/
│   ├── analytics/          # submodules → @anvilkit/analytics-{core,react}
│   ├── canvas/             # submodules → canvas core + editor
│   ├── cli/                # @anvilkit/cli — `anvilkit` CLI scaffold
│   ├── components/         # submodule → @anvilkit/* component packages (own pnpm workspace)
│   ├── contracts/          # @anvilkit/contracts — shared type-only contracts (Page IR, AI, export, pages)
│   ├── core/               # @anvilkit/core — runtime, plugin engine, <Studio> shell
│   ├── ir/                 # @anvilkit/ir — Headless Page IR transforms
│   ├── schema/             # @anvilkit/schema — AI-friendly schema derivation
│   ├── validator/          # @anvilkit/validator — Puck Config validator
│   ├── ui/                 # @anvilkit/ui — shared UI primitives
│   ├── utils/              # @anvilkit/utils — shared helpers
│   ├── templates/          # @anvilkit/template-* — page template packages
│   ├── create-plugin/      # @anvilkit/create-plugin scaffolder
│   ├── configs/            # biome-config · tailwind-config · typescript-config · vitest-config
│   └── plugins/            # submodules (see Git & Submodules)
```

**Package manager**: pnpm 11.10.0 (strictly pinned). **Orchestration**: Turbo. Each component under `packages/components/src/<slug>/` is an independently versioned, publishable package.

## Commands

### Root workspace

```bash
pnpm dev          # Turbo watch mode for all packages
pnpm build        # Build all packages
pnpm lint         # Biome lint
pnpm typecheck    # TypeScript type checking across workspace
pnpm test         # Vitest across every workspace package (Turbo cache)
pnpm madge        # Circular dependency scan (packages/, ts+tsx)
pnpm publint      # Validate package.json exports across publishable packages
pnpm size         # size-limit gzip budgets per publishable package
pnpm bench        # tinybench perf harness vs ./bench/baseline.json (bench:update re-records)
pnpm docs:dev     # Docs site dev server (apps/docs, port 4321)
pnpm docs:build   # Build the docs site
```

### Components workspace (`packages/components/`)

```bash
pnpm dev|build|lint|typecheck    # Rslib watch / build / Biome / tsc
pnpm gen:component               # Scaffold a new component (interactive; supports --name/--label/--template/--category)
pnpm changeset && pnpm release   # Version + build + publish to npm
```

### Demo app (`apps/demo/`)

```bash
pnpm dev          # Next.js dev server (port 3000)
pnpm build|lint   # Production build / Biome lint
pnpm typecheck    # next typegen + tsc
pnpm e2e          # Playwright E2E (smoke + export + AI copilot); e2e:install once for Chromium
```

### Docs site (`apps/docs/` — `@anvilkit/docs-site`)

```bash
pnpm docs:dev     # Vite dev server (TanStack Start, port 4321) — also boots the collab relay
pnpm docs:build   # vite build → Nitro Build Output API at apps/docs/.vercel/output (SSR → Vercel)
pnpm typecheck    # fumadocs-mdx && tsc --noEmit
pnpm test         # vitest (registry + guide code-block tests)
pnpm e2e          # Docs playground Playwright spec
```

Docs content lives under `content/docs/**` (MDX). Generators (`scripts/generate-*`) emit MDX for component pages, the API reference, template pages, and the marketplace `registry/feed.json`; the generated trees (`content/docs/{components,api,templates}`) are **committed** — run `pnpm generate:all` after changing a component/plugin.

> **Deploy model**: the docs app is SSR — Vercel's Root Directory must be `apps/docs` (reads `apps/docs/vercel.json`, consumes the Nitro output). There is no root `vercel.json`.

## Architecture

- **Publishing model**: each component is its own npm package (`@anvilkit/<slug>`), versioned independently via Changesets — no umbrella package. Built with **Rslib** → CJS + ESM + `.d.ts`.
- **Puck component contract**: every component package exports `componentConfig` (Puck config), `defaultProps` (serializable), `fields`, and `metadata` (label, description, category, icon). The render component accepts **only serializable props** — no functions or refs at the top level.
- **Demo integration**: the demo validates components via `/puck/editor` (interactive builder) and `/puck/render` (server-side, RSC-compatible), both composed from `apps/demo/lib/puck-demo.ts` (all 11 published component packages are wired there). A new component must be added to that file AND to `transpilePackages` in `apps/demo/next.config.js`.
- **Styling**: Tailwind CSS 4 (CSS-first config, no `tailwind.config.js`) — consumers import shared tokens with `@import "@anvilkit/tailwind-config/shadcn"`; shadcn-style CSS variable tokens with light/dark mode. All components must be responsive and theme-aware.
- **TypeScript**: 6.0.2 at the workspace level; demo pins TS 5.9.2 for Next.js compatibility.
- **CI** (`.github/workflows/ci.yml`, every PR): recursive submodule checkout, pnpm 11.10.0 / Node 22, then `lint`, `typecheck`, `madge`, `test`, `build`, `turbo run docs:build`, `publint`, the `@anvilkit/core` release gates (`pnpm --filter @anvilkit/core check:all`), Phase 3 release gates (`contracts`/`ir`/`schema`/`validator`/`plugin-export-html`/`plugin-export-react`/`plugin-ai-copilot`), per-package `size-limit` budgets, and two Playwright suites (demo E2E + docs playground E2E). Other workflows: `publish.yml`, `bench.yml`, `size.yml`, `generator-smoke.yml`, `templates-smoke.yml`. The Vercel docs deploy posts an independent check — it neither blocks nor is blocked by CI.

## TypeScript & React Standards

- Use `import type` for type-only imports — `verbatimModuleSyntax` is enforced.
- No circular dependencies (`pnpm madge` is a CI gate); when a cycle forms, prefer inlining small type references over cross-module imports.
- **RSC boundaries**: `/puck/render` executes server-side — component code with hooks/interactivity needs a `'use client'` directive. A missing directive has caused a real production 500; check this whenever a component renders in both Puck modes.
- **Size budgets**: publishable packages have `size-limit` gzip budgets — run `pnpm size` when touching runtime code and don't regress a budget for a micro-optimization.
- **Iframe/canvas styling**: Tailwind utilities and parent-document CSS do NOT reach the canvas iframe — use inline styles or explicit CopyHostStyles injection. Before debugging styling, suspect stale webpack/dev-server cache and try a clean rebuild.
- **i18n**: never duplicate bilingual strings inline — always use i18n message keys. Don't add language-specific (e.g. Chinese) translation overrides to demo apps unless explicitly requested.

## Verification / Definition of Done

- Run the full gate suite — **typecheck, lint, test, build** (plus `madge` and `publint` for package-level work) — and confirm green before declaring any task complete. Regenerate api-snapshots when hash drift is benign.
- Always rebuild the affected package's dist (`pnpm build`) before declaring a fix complete — unit tests passing is NOT sufficient when a running demo/browser executes built code. Build dependent packages before assuming module-resolution errors are code issues.
- When tests fail due to pre-existing infrastructure issues (path aliases, missing dist folders), report this clearly rather than skipping verification. The repo has known path-alias issues in some suites — flag them, don't silently skip.
- E2E: use unique room IDs per test and avoid port 1234 collisions (dynamic ports, or kill stale processes first).
- knip and shellcheck are intentionally skipped (not installed; the only `.sh` files live under `node_modules/`) — reintroduce if that changes.

## CI Gates

- When fixing api-snapshot or version-drift gate failures, check for CRLF pollution and formatter-hook reformatting **before** staging — regenerate snapshots only once line endings are clean, and distinguish benign hash drift from a real API change.

## Git & Submodules

**Automatic commits are disabled.** Claude never creates commits on its own initiative — not to "finish" a task, not after checks pass, not in a submodule, not because a skill or workflow normally would. All commits and gitlink bumps are made by the user after manual review.

- Never run state-changing git/gh commands: `git add`/staging, `git commit` (including `--amend`), `git rebase`, `git merge`, `git cherry-pick`, `git reset`, `git clean`, `git checkout`/`switch` (branch changes), `git tag`, `git push`, `gh pr create`. The only exception is an explicit user request in the current conversation naming the action — and even then, never force-push and never push to main.
- Read-only inspection is always fine: `git status`, `git diff`, `git log`, `git show`, `git branch`, `git submodule status`.
- After making changes: leave everything unstaged, summarize the modified files (noting which live inside submodules) and the checks you ran — then stop.

Submodule layout (16 total — the canonical source is `.gitmodules`; verify with `git config -f .gitmodules --get-regexp path` rather than trusting any list): `packages/components`, eleven plugins under `packages/plugins/` (ai-copilot, ai-image, asset-manager, canvas-studio, collab-ui, collab-yjs, design-system, export-canvas, export-html, export-react, version-history), plus direct submodules `packages/canvas/{core,editor}` and `packages/analytics/{core,react}` — the parent directories (`plugins/`, `canvas/`, `analytics/`) are plain directories, not submodules.

- `git submodule update --init --recursive` after cloning.
- **Convention (REQUIRED)**: every new module is added as a git submodule grouped under a plain parent directory, registered in `.gitmodules` + the matching `pnpm-workspace.yaml` glob (`packages/<group>/*`). Promotion of a scaffolded package (the maintainer's step — needs a remote repo):

```bash
git submodule add https://github.com/ancyloce/anvilkit-<name>.git packages/<group>/<name>
# add "packages/<group>/*" to pnpm-workspace.yaml if the group is new, then verify:
git config -f .gitmodules --get-regexp path
```

- Submodule edits do **not** show in the superproject's `git status` — work inside the submodule's working tree; the commit there and the superproject gitlink bump are the user's actions.

## Adding a New Component

1. `pnpm gen:component` in `packages/components/` (prompts for slug, label, template, category)
2. Implement `src/<Slug>.tsx` (render), `src/config.ts` (Puck config), `src/index.ts` (exports)
3. Validate: `pnpm lint && pnpm typecheck && pnpm build`
4. Wire into the demo: `apps/demo/lib/puck-demo.ts` + `transpilePackages` in `apps/demo/next.config.js`
5. Changeset + release are the user's steps (`pnpm changeset`, `pnpm release`)

Full component rules: `packages/components/AGENTS.md`.

## Working Rules

- For a **code review, analysis, audit, or roadmap**, start producing the deliverable immediately — no plan-approval or scoping questions; make reasonable assumptions, state them inline, and pause only on a genuine blocker.
- Default to autonomous multi-file execution: chain related fixes in one pass, self-verify through the gates, and report once the work survives verification. Prefer a root-cause fix plus a regression test over a band-aid; iterate when verification fails. Track multi-finding work as numbered items (P0/P1/P2 or R1…/F1…) and drive each to closure.
- **Code review**: after every review, run the actual gates (typecheck, lint, tests, build, E2E) and adversarially verify findings against source before reporting them confirmed. For whole-package/directory reviews, use `/codex:adversarial-review` on the working-tree diff rather than `/codex:review` (which can't target directories); if a run produces no output for several minutes, suspect a stdin-blocking hang — diagnose and relaunch instead of waiting.
- **Sub-agents**: before refactoring a component or threading new props/plugins, spawn an Explore sub-agent to enumerate every call site (file:line) — no edits until enumeration is complete. Use parallel sub-agents for exploration across plugin packages/submodules; sub-agents enumerate and report, the main agent decides and writes.
- **Demo & mount consistency**: when wiring new props or plugins to Studio components, find and wire ALL `<Studio>` mounts in the demo (default and collab paths); grep component usage across `demo/` before declaring done.
- **Safe deletion**: before deleting any file, grep for inbound references (imports, paths in JSON/MD, test fixtures); present a deletion list with reference counts and wait for approval before any `rm`.
- **File handling**: verify each Edit actually applied.
- **Output**: keep responses concise and chunk large outputs — never exceed the 500-output-token limit in a single message; write long reports to files.
- **Shell**: portable only (interactive shell is zsh — no bash-only constructs); scope `find`/`grep` to the project directory and exclude `node_modules`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.

- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Failing CI gates, red checks, drift (api-snapshot/version), "make checks pass" → invoke fixgates
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
