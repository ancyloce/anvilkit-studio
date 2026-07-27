# CLAUDE.md

Claude Code instructions for this repository. Follow this file over generic habits.

Root `AGENTS.md` holds the tool-agnostic repository rules (dependency direction, submodule policy, generated-docs policy) and applies too — do not duplicate it here. This file owns the Claude-specific layer: hard rules, reuse-first policy, commands, verification gates, and skill routing.

## Instruction Placement

- Stable project-wide rules live here; tool-agnostic ones live in `AGENTS.md`.
- Package/path-specific rules live in `.claude/rules/*.md` with `paths:` frontmatter.
- Long repeatable workflows live in `.claude/skills/<name>/SKILL.md`.
- Hard enforcement belongs in hooks/settings, not only in prose.
- Use `/memory` to verify which instruction files are loaded when behavior looks wrong.

## Working Directory Discipline

- Verify `pwd` and the git repo root before building, testing, or editing.
- The authoritative checkout is the main repo root (`/root/Rhett/anvilkit-studio`). Never build or edit in staging or worktree copies unless explicitly asked.
- If a worktree is used, delete it and relocate files back to the main checkout when done.
- `.claude/worktrees/*` holds real checkouts of other branches. Never edit there, and always exclude it from searches — it silently doubles every grep hit.

## Git Policy

- Never run `git commit`, `git push`, or open a PR unless the user explicitly asks in that message. Default to leaving changes uncommitted in the working tree and reporting a summary of modified files, including which ones are inside submodules.
- Read-only git commands are always fine: `status`, `diff`, `log`, `show`, `branch`, `submodule status`.
- Never stage, amend, rebase, merge, cherry-pick, reset, clean, tag, or switch branches unless asked for that exact action. Never force-push and never push to `main`.
- `git commit` and `git push` are additionally hard-blocked by a PreToolUse hook — treat a block as the policy working, not an obstacle to route around.

## Active Hooks (they fire mid-task; expect them)

Configured in `.claude/settings.json`:

- **`git commit` / `git push` are hard-blocked** by a PreToolUse hook. The user handles all commits and pushes.
- **Writes under any `dist/` are blocked** — edit source and rebuild (rslib wipes `dist/`).
- **Biome autoformats every file** written via Write/Edit, immediately after the write.
- **JSX without a React binding is blocked** in `packages/extensions/plugins/**` and `packages/capabilities/canvas/**` `.tsx` — those build classic JSX, so `dist` throws `React is not defined` at runtime and typecheck will not catch it. Add `import * as React from "react";`.

`pnpm prepare` sets `core.hooksPath=.githooks`: pre-commit runs react-doctor on staged files; pre-push runs `check:all` for packages changed vs `origin/main` (`ANVILKIT_CHECK_BASE` overrides the base).

## Hard Rules

- **Git is read-only for Claude** — see **Git Policy** above.
- **Reuse before writing.** No new utility, wrapper, hook, component, abstraction, or dependency without passing the Reuse-First check below.
- **Formatting is Biome with TAB indentation.** Never run Prettier. Never introduce CRLF line endings. Root `pnpm format` fans out to the per-package Biome scripts.
- **UI work uses `@anvilkit/ui` primitives.** Do not hand-roll native controls (e.g. a native `<select>` language switcher), bespoke CSS, or custom components when a shared primitive exists.
- **New packages stay in the monorepo by default.** Apply the lifecycle and ownership policy in `docs/architecture/repository-structure.md` before proposing a separate repo or submodule.
- Use `typecheck`, never `check-types`.
- Never overwrite an existing plan/ADR/report file — see **Documents & PRDs** below.
- Never weaken tests, gates, lint rules, type checks, or size budgets to get green. Report pre-existing failures clearly.

## Reuse-First Engineering

New code is a last resort. Before implementing anything, prove that reuse is not enough.

Check these layers in order, and be able to state why each is insufficient:

1. JavaScript built-ins — `Array`, `Object`, `Map`, `Set`, `Intl`, `URL`, `URLSearchParams`, `structuredClone`, `AbortController`, `crypto.randomUUID`.
2. TypeScript features — utility types, `satisfies`, template literal types, discriminated unions, const assertions, narrowing, inference.
3. React APIs — built-in hooks, context, Suspense, `useId`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`.
4. Node built-ins — `node:path`, `node:fs`, `node:crypto`, `node:util`, `node:events`.
5. Existing repo code — `@anvilkit/utils`, `@anvilkit/ui`, `@anvilkit/contracts`, `@anvilkit/core`, `packages/tooling/configs/*`, and the package being edited.
6. Existing deps in the relevant `package.json`. Read the installed version's API before using it.
7. Libraries already accepted elsewhere in the workspace.

Rules:

- Do not reinvent platform, language, framework, or repo behavior: no duplicate `debounce`, `deepClone`, `groupBy`, event emitter, validation layer, or custom select.
- New dependencies require explicit user confirmation. Name the built-in, in-repo, and already-installed options considered, and why each is insufficient.
- Custom code is justified only for project-specific business logic or necessary integration boundaries.
- Avoid premature abstraction. Extract a shared helper only at the third real call site, or when duplication is a correctness risk.
- Avoid gratuitous helpers when native syntax is clearer. Prefer boring, tested, maintainable code over clever code.
- Follow the conventions of the package being edited, even where another pattern would be personally preferred.
- Never silently introduce a new pattern, dependency, directory convention, or architectural boundary.

## Project Overview

`anvilkit-studio` is AnvilKit's frontend SDK, Puck-native Studio runtime, extension ecosystem, reference product, docs/marketplace app, integration suite, and frontend developer-tooling repository. Public packages keep stable independent `@anvilkit/*` names even when release groups are coordinated.

## Repository Map

The authoritative current/target map, classifications, app roles, platform boundary, and placement rules live in `docs/architecture/repository-structure.md`. Read it before structural, workspace, CI, release, or submodule work.

- Dependency direction is `apps → extensions → capabilities → runtime → foundation`. Packages must never import applications. `pnpm madge` gates cycles but does not enforce layering.
- `apps/studio`: full product-grade reference app (renamed from `apps/demo` in Phase 1).
- `apps/playground`: minimal package compatibility app — public `@anvilkit/*` exports only, no source aliases, no product features. Dev serves on port 3100.
- `apps/docs`: Fumadocs on TanStack Start/Vite plus marketplace.
- `apps/collab`: standalone production-capable service targeted for extraction to `anvilkit-platform`; do not move it silently.

## Commands

Scripts live in each package's manifest. Non-obvious ones: `pnpm gen:component` (run inside `packages/extensions/components/`), and root `pnpm check:all` / `pnpm check:push` as the aggregate release gates.

## Architecture Contracts

- Each component is its own npm package; there is no umbrella package.
- Every Puck component package exports `componentConfig`, `defaultProps`, `fields`, and `metadata`.
- Render props must be serializable. Do not expose functions or refs at the top level.
- New components must be wired into `apps/studio/lib/puck-demo.ts` and `transpilePackages` in `apps/studio/next.config.js`.
- Tailwind CSS 4 is CSS-first. Do not add `tailwind.config.js`.
- **Pick the right `@anvilkit/tailwind-config` entry** — they are not interchangeable:
	- `@import "@anvilkit/tailwind-config/component"` in **component packages** — preflight-free and source-scoped.
	- `@import "@anvilkit/tailwind-config/shadcn"` in **apps and runtime CSS** (`apps/studio`, `apps/docs`, `@anvilkit/core`, `canvas-editor`). Using this in a component package duplicates ~1.8 MB of preflight.
	- `@anvilkit/tailwind-config/postcss` for PostCSS config only.
- Docs generated content under `apps/docs/content/docs/{components,api,templates}` is committed. Run the owning `apps/docs` generator after changing component/plugin APIs; never hand-edit generated output.
- Vercel docs deployment uses `apps/docs` as root and `apps/docs/vercel.json`.

## TypeScript & React Standards

- Use `import type` for type-only imports; `verbatimModuleSyntax` is enforced.
- No circular dependencies. `pnpm madge` is a CI gate.
- For RSC-compatible render paths, add `'use client'` when hooks or browser-only APIs are used.
- Respect size-limit budgets for publishable packages.
- Canvas iframe styles do not inherit parent CSS. Use inline styles or explicit host-style injection.
- Do not duplicate bilingual strings inline — use i18n message keys. Do not add language-specific studio-app translation overrides unless explicitly requested.
- When regenerating docs/i18n content, escape YAML frontmatter values (especially strings starting with `@`) and avoid unescaped JSX-like strings in MDX tables.

## Styling Rules

- All styling is Tailwind CSS. No native CSS rules, CSS modules, CSS-in-JS, styled-components, or alternative styling libraries.
- Prefer existing Tailwind utilities, semantic design tokens, shadcn/ui components, and reusable variants.
- `globals.css` may only contain Tailwind imports, theme tokens, and unavoidable global base rules.
- Component- and page-specific styling stays in JSX through Tailwind classes.
- Inline styles are allowed only for values computed at runtime that Tailwind cannot reasonably express.

## Scope Control

- Keep edits strictly inside the packages named in the request.
- Do not run workspace-wide codegen, doc regeneration, or formatters that touch unrelated packages. If a tool does it anyway, revert the out-of-scope diffs before reporting. `apps/docs` `generate:api` is the known offender — it has no per-package scope and sweeps the whole workspace.
- Prefer explicit per-file edits over `replace_all`, and verify every intended occurrence actually changed.
- Report any file you touched outside the requested scope, even if the change was correct.

## Verification Gates

- Run and report the relevant gates before claiming completion: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Add `pnpm madge` and `pnpm publint` for package-level work.
- After any multi-file change, run the full pre-push gate (`pnpm check:push`, or `pnpm check:all` for the whole workspace) and report the **exact pass/fail count from that run's output**. Do not carry a task count over from a previous run — turbo's task total varies with which packages changed (a full-workspace `check:all` currently expands to 114 tasks across 21 packages; `check:push` filters to packages changed vs `origin/main`).
- Do not claim a check passed unless it was executed. Report the exact command and any pre-existing failure — never skip or hide one.
- **Empty test output is a failure, not a pass.** Before declaring E2E green, confirm the run actually produced test output with a nonzero test count.
- Kill orphaned Playwright and dev-server processes on the target port before rerunning E2E. Use unique room IDs and avoid port collisions.
- Rebuild affected packages before declaring runtime/browser-facing changes done.
- For UI behavior, drive the real app (`/run`), not only unit tests.
- Do not regenerate snapshots blindly. Distinguish benign hash drift from real API changes.
- CI (`.github/workflows/ci.yml`) is path-aware, gated by a `changes` classification job: `validate` (lint/typecheck/madge/test/build), `package-gates` (publint + `check:all`), `editor-perf`, `studio-e2e`, `playground-e2e`, `docs`.

## Documents & PRDs

- PRDs, review reports, and implementation plans live under `docs/` with a zero-padded four-digit index per subdirectory: `docs/prd/` (note: singular), `docs/plans/`, `docs/reviews/`, `docs/adr/`, `docs/tasks/`, `docs/analysis/`, `docs/migration/`, `docs/security/`. Many also carry a `-MMDD-HHMM` suffix, e.g. `docs/reviews/0004-prd-0012-remaining-unimplemented-0717.md`.
- **List the target directory to claim the next free index immediately before writing** — a concurrent session may have taken it. Never overwrite an existing document; back it up or take the next index.
- Every claim in a PRD or review report must be verified against actual repo files and cite the file path. Do not restate a claim from an earlier document without re-verifying it.
- `.gitignore` ignores `/docs/*` **except** `architecture/`, `adr/`, `policies/`, `migration/`, and `security/`. Documents written to `docs/prd/`, `docs/plans/`, `docs/reviews/`, `docs/tasks/`, and `docs/analysis/` are working-only and will not appear in a fresh clone — say so when handing one over.

## Submodules

- Verify submodule paths from `.gitmodules`: `git config -f .gitmodules --get-regexp path`.
- Submodule groups: `packages/extensions/components`, `packages/extensions/plugins/*`, `packages/capabilities/canvas/{core,editor}`, `packages/capabilities/analytics/{core,react}`. Parent dirs `plugins/`, `canvas/`, and `analytics/` are plain directories, not submodules.
- Submodule edits may not show in superproject status. Inspect inside the submodule working tree, and call out which modified files live in submodules.

## Working Rules

- For analysis, audit, roadmap, or review tasks, start the deliverable immediately. Do not ask for plan approval unless blocked.
- Before editing shared code, enumerate call sites first — use the `wiring-enumerator` subagent or read-only exploration for large sweeps.
- When wiring Studio props/plugins, grep every `<Studio>` mount in studio-app paths.
- Before deleting files, grep inbound references and present a deletion list with reference counts.
- For refactors, prefer a root-cause fix plus regression test over a band-aid.
- Verify every edit actually applied.
- Keep responses concise. Write long reports to files.
- Use portable shell commands; avoid bash-only constructs unless the script already requires bash.
- Scope `find`/`grep`/`rg` to the project and exclude `node_modules`, `dist`, and `.claude/worktrees`.

## Skill Routing

When a skill matches the task, use it before free-form work. The harness injects each skill's own description — the notes below only cover what it cannot disambiguate.

**User-invoked only** (marked `disable-model-invocation`; Claude cannot start these — tell the user to type the command):

- `/add-component` — scaffold and wire a new component package. Full rules: `packages/extensions/components/AGENTS.md`.
- `/release-prep` — pre-release verification and go/no-go checklist.

**Picking among the four review skills:**

- `review` — pre-landing review of a PR/diff.
- `adversarial-review` — audit one package from scratch, refute optimistic claims, write a findings report file.
- `review-remediate` — review a package from scratch **and** fix everything to green.
- `review-fixes` — a findings report already exists; close out every item.

**Other repo skills:** `phase-execute` (drive a PRD phase with per-task gates), `pre-refactor` (checklist before any refactor), `react-doctor` (React diagnostics triage).

**Intent → skill:** bugs/500s → `investigate`; red CI or gates → `fixgates`; ship/deploy/PR → `ship`; QA the site → `qa`; docs after shipping → `document-release`; product/build-worthiness → `office-hours`; design system or brand → `design-consultation`; visual polish → `design-review`; architecture review → `plan-eng-review`; code health → `health`; weekly retro → `retro`.

**Read-only specialist subagents** (`.claude/agents/`): `release-gate-triager` (classify gate failures as pre-existing vs regression), `submodule-integrity` (gitlink drift, unpushed targets, orphan risk), `wiring-enumerator` (every Studio/Canvas mount and wiring site).

If a listed skill is not installed, say so and continue with the closest built-in workflow.
