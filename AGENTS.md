# Repository Instructions

- Read `docs/architecture/repository-structure.md` before structural, package-boundary, workspace, CI, release, or submodule changes.
- Read every nested `AGENTS.md` that applies to files you edit. Nested files refine this file for their directory scope.
- Preserve public npm package names, exports, repository metadata, and Changesets behavior when moving physical paths.
- Respect the dependency direction `apps -> extensions -> capabilities -> runtime -> foundation`. Repository tooling is outside this product graph. Packages must never import applications.
- Prefer platform APIs, existing repository utilities, and established dependencies. Do not add a dependency or custom parser when existing tooling solves the problem.
- Do not create a Git submodule by default. Apply the lifecycle and ownership policy in the canonical architecture document and record the decision.
- Treat `.gitmodules`, gitlinks, submodule paths, and submodule lockfiles as high risk. Inspect `.gitmodules` directly and verify `git diff --submodule` before completion.
- Do not edit generated documentation manually when a generator exists. Use the owning package's generation command.
- Never overwrite an existing plan, ADR, or report. Use the next available numeric index.
- Use Biome for repository formatting. Do not use Prettier for repository files.
- Run the applicable root gates before completion: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm madge`, and `pnpm publint`, plus docs or package-specific checks for changed surfaces.
- Do not claim a check passed unless it was executed. Report the exact command and any pre-existing failure.
- Do not stage, commit, push, reset, discard, or stash changes unless the user explicitly requests that Git operation. Preserve unrelated worktree changes.

## Agent Setup

This repository runs a multi-surface agent setup, not a single-developer flow: layered instruction files, read-only specialist subagents, and repository skills that codify recurring workflows.

### Instruction files

- `AGENTS.md` (this file) — repository-wide rules for any AI agent.
- `packages/extensions/components/AGENTS.md` — component-authoring rules; refines this file for that directory scope.
- `CLAUDE.md` — Claude Code-specific project instructions: hard rules, reuse-first policy, commands, verification gates, and skill routing.

### Specialist subagents (`.claude/agents/`)

All three are read-only: they report and never edit or run write commands.

- `release-gate-triager` (test/release role) — runs the `check:all` release gates per changed package in isolation, then classifies each failure as pre-existing vs regression using this repo's known failure patterns (api-snapshot drift, bundle-size overflow, phantom concurrency oversubscription). Use when `check:all` or the pre-push gate fails, or before a release.
- `submodule-integrity` (ops role) — audits every git submodule for gitlink drift, unpushed gitlink targets, detached-HEAD orphan risk, dirty working trees, and uninitialized submodules. Use before any main-repo commit/push or release.
- `wiring-enumerator` (dev role) — enumerates every Studio/Canvas mount and plugin/component wiring site (file:line) across the studio app, docs, and core. Use before refactoring a component, threading a new prop/plugin, or adding a component package.

### Repository skills (`.claude/skills/`)

- `add-component` — scaffold a new `@anvilkit/<slug>` component package and thread it through every wiring site, then validate through the gates.
- `release-prep` — pre-release verification and go/no-go checklist; runs changeset status and release gates, enforces publish gotchas, and hands the publish command to the user.
- `phase-execute` — phased PRD-driven execution: decompose a phase into atomic tasks and run gates after each.
- `pre-refactor` — checklist to run before any refactor.
- `adversarial-review` — adversarial audit of a target package with a saved findings report.
- `review-remediate` — produce a review from scratch, then remediate every finding to green.
- `review-fixes` — close out an existing review findings report, one finding at a time with regression tests.
- `react-doctor` — React diagnostics triage (lint, accessibility, bundle size, architecture).

## Automation Scripts

- `scripts/check-submodule-contracts.mjs` (`pnpm check:submodules`) — validates every `.gitmodules` entry against `scripts/submodule-contract.json`: path/entry parity, URL match, initialization state, and package name/private-flag against the contract's `name`/`npmAccess`.
- `scripts/ensure-npm-packages-exist.mjs` — pre-publish guard: enumerates public workspace packages from `pnpm-workspace.yaml`, fails if a public package name does not exist on npm, and writes GitHub Action outputs for the publish workflow. It never publishes.
- `scripts/codemods/` — one-off codemods with applied/opt-in candidate reports (currently `inline-style-to-tailwind.mjs`).

### Git hooks (`.githooks/`, enabled by `pnpm prepare` via `core.hooksPath`)

- `pre-commit` — react-doctor scan of staged files (fails on warning).
- `pre-push` — `turbo run check:all` for workspace packages changed against `origin/main` (`ANVILKIT_CHECK_BASE=<ref>` changes the base; `git push --no-verify` bypasses). Gates the superproject only; submodules have their own hooks.

## CI/CD Pipelines (`.github/workflows/`)

- `ci.yml` — the pull-request gate, split into path-aware jobs: `changes` classifies changed paths (`dorny/paths-filter`) so leaf-app-only changes skip unrelated jobs; `validate` runs `pnpm lint`, `typecheck`, `madge`, `test`, `build`; `package-gates` runs `pnpm build`, `publint`, `check:all`; `studio-e2e` and `playground-e2e` run Playwright suites with uploaded reports; `docs` runs `docs:build` plus the docs Playwright suite. Setup uses pnpm 11.10.0 / Node 22 with recursive submodule checkout.
- `size.yml` — per-package gzip budgets via `size-limit` on pull requests.
- `react-doctor.yml` — react-doctor diagnostics on pull requests.
- `bench.yml` — performance regression gate (builds studio, drives an editor-load bench via Playwright). Its `bench/` harness directory was recently removed, so this workflow and the root `bench` scripts are currently stale.
- `clean-clone.yml` — validates clone/install topology when files defining it change; also dispatchable on demand before a release.
- `generator-smoke.yml` — weekly cron smoke test of the generators.
- `marketplace-scorecard.yml` — marketplace entry validation on pull requests plus a weekly cron re-check of previously passing entries.
- `publish.yml` — release publishing on push, plus a maintainer-dispatched ceremony flow where the maintainer picks a `mode`.
- `docker-images.yml` — GHCR image builds on push and manual dispatch.

The Vercel docs deployment posts an independent GitHub check; it neither blocks nor is blocked by CI.
