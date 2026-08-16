# CLAUDE.md

Claude Code instructions for this repository. Follow this file over generic
habits. Root `AGENTS.md` applies in full and owns the tool-agnostic rules
(dependency direction, submodule lifecycle, generated-docs policy,
never-overwrite-documents, evidence-for-checks) — not repeated here. This
file owns the Claude layer: hard rules, reuse-first, commands, gates, skill
routing.

Placement: stable project-wide rules → here; tool-agnostic → `AGENTS.md`;
path-specific → `.claude/rules/*.md` (`paths:` frontmatter); long workflows
→ `.claude/skills/`; hard enforcement → hooks/settings, not prose. Use
`/memory` to verify what loaded when behavior looks wrong.

## Working directory

Verify `pwd`/repo root before building, testing, or editing. The
authoritative checkout is `/root/Rhett/anvilkit-studio` — never build or
edit in staging/worktree copies unless explicitly asked; if a worktree is
used, delete it and relocate results back. `.claude/worktrees/*` holds real
checkouts of other branches: never edit there, always exclude it from
searches (it silently doubles every grep hit).

## Git: read-only for Claude

- Never `git commit`, `git push`, or open a PR unless the user explicitly
  asks in that message (commit/push are also hook-blocked — a block is the
  policy working, not an obstacle to route around). Default: leave changes
  uncommitted and report modified files, flagging those inside submodules.
- Never stage, amend, rebase, merge, cherry-pick, reset, clean, tag, or
  switch branches unless asked for that exact action. Never force-push,
  never push `main`. Read-only git is always fine.

## Hooks (fire mid-task; expect them)

`.claude/settings.json`: git commit/push hard-blocked · writes under any
`dist/` blocked (edit source + rebuild; rslib wipes dist) · Biome
autoformats every Write/Edit · JSX without a React binding blocked in
`packages/extensions/plugins/**` and `packages/capabilities/canvas/**`
`.tsx` — classic JSX makes `dist` throw `React is not defined` at runtime,
invisible to typecheck; add `import * as React from "react";`.

`pnpm prepare` sets `core.hooksPath=.githooks`: pre-commit runs react-doctor
on staged files; pre-push runs `check:all` for packages changed vs
`origin/main` (`ANVILKIT_CHECK_BASE` overrides the base).

## Hard rules

- The Puck contract (below) is mandatory; violations are
  architecture-blocking.
- Reuse before writing (below).
- Formatting is Biome with TAB indentation — never Prettier, never CRLF.
  Root `pnpm format` fans out to per-package Biome scripts.
- UI work uses `@anvilkit/ui` primitives — no hand-rolled native controls,
  bespoke CSS, or custom components where a shared primitive exists.
- New packages stay in the monorepo by default; apply
  `docs/architecture/repository-structure.md` before proposing a separate
  repo or submodule.
- Use `typecheck`, never `check-types`.
- Never weaken tests, gates, lint rules, type checks, or size budgets to
  get green. Report pre-existing failures clearly.

## Reuse-first

New code is a last resort. Before implementing, confirm each layer is
insufficient, in order: (1) JS built-ins (`Intl`, `URL`/`URLSearchParams`,
`structuredClone`, `AbortController`, `crypto.randomUUID`, …); (2)
TypeScript features (utility types, `satisfies`, discriminated unions,
narrowing); (3) React APIs (built-in hooks, context, Suspense, `useId`,
`useSyncExternalStore`, `useDeferredValue`, `useTransition`); (4) Node
built-ins; (5) repo code (`@anvilkit/utils|ui|contracts|core`,
`packages/tooling/configs/*`, the package being edited); (6) existing deps
in the relevant `package.json` — read the installed version's API first;
(7) libraries already accepted elsewhere in the workspace.

No duplicate `debounce`/`deepClone`/`groupBy`/event emitter/validation
layer/custom select. New dependencies require explicit user confirmation,
naming the built-in/in-repo/installed options considered and why each is
insufficient. Custom code is justified only for project-specific business
logic or necessary integration boundaries. Extract a shared helper only at
the third real call site or on correctness risk. Prefer boring code and the edited package's
conventions; never silently introduce a new pattern, dependency, directory
convention, or architectural boundary.

## Repository

`anvilkit-studio`: AnvilKit's frontend SDK, Puck-native Studio runtime,
extension ecosystem, reference product, docs/marketplace app, integration
suite, and frontend tooling. Public packages keep stable independent
`@anvilkit/*` names even under coordinated release groups.

Authoritative map, classifications, and placement rules:
`docs/architecture/repository-structure.md` — read before structural,
workspace, CI, release, or submodule work. Dependency direction is
`apps → extensions → capabilities → runtime → foundation`; packages never
import applications (`pnpm madge` gates cycles, not layering).

- `apps/studio` — full product-grade reference app.
- `apps/playground` — minimal package-compat app: public `@anvilkit/*`
  exports only, no source aliases, no product features; dev port 3100.
- `apps/docs` — Fumadocs on TanStack Start/Vite, plus marketplace.
- `apps/collab` — standalone production-capable service targeted for
  extraction to `anvilkit-platform`; do not move it silently.

## Commands & verification gates

Scripts live in each package's manifest; non-obvious: `pnpm gen:component`
(run inside `packages/extensions/components/`). Use the aggregates — never
retype the `&&` chain; both fail fast, so the failing stage is the broken
one:

| Script | Runs | When |
| --- | --- | --- |
| `pnpm gate:quick` | typecheck → lint → test | inner loop, after any edit |
| `pnpm gate:full` | typecheck → lint → madge → test → build → publint → check:all | before declaring multi-file work done (mirrors CI) |

- `gate:full` is whole-workspace; the changed-packages variant is
  `pnpm check:push` (vs `origin/main`; `ANVILKIT_CHECK_BASE` overrides) —
  what pre-push runs. `check:all` is where `check:api-snapshot`,
  `check:bundle-budget`, `check:circular`, `check:publint` run. Deliberately
  omitted from `gate:full`: `pnpm size` and `pnpm check:submodules` — run
  them explicitly for release/submodule work. Running single stages alone
  is fine when you know what you're checking.
- After any multi-file change, run `gate:full` and report the exact
  pass/fail counts **from that run** — turbo task totals vary; never carry
  a count over.
- Empty or ambiguous test output is a failure, not a pass — re-run and read
  the summary line; E2E green requires a nonzero test count.
- Before rerunning E2E: kill orphaned Playwright/dev-server processes on
  the target port; unique room IDs; no port collisions.
- Rebuild affected packages before declaring runtime/browser-facing work
  done. For UI behavior, drive the real app (`/run`), not only unit tests.
- Don't regenerate snapshots blindly — classify benign hash drift vs a real
  API change (Environment hygiene #4).
- CI (`.github/workflows/ci.yml`) is path-aware via a `changes` job:
  `validate`, `package-gates`, `editor-perf`, `studio-e2e`,
  `playground-e2e`, `docs`.

## Environment hygiene (before debugging build errors)

In this repo the root cause is environmental more often than not — state
the result of each relevant check before proposing a code bug:

1. Stale Next cache → `rm -rf apps/*/.next` + restart. Never delete `.next`
   or `dist/` while a dev server/watcher runs.
2. Orphaned Playwright webServer holding the port → check the port,
   `pkill -f playwright`.
3. Nested-workspace install order clobbering TypeScript →
   `pnpm why typescript` in the failing package (a package in two
   workspaces gets whichever install ran last).
4. Drifted API snapshots → regenerate, never hand-edit; `git add` new
   source files BEFORE regenerating (the emitter drops their URLs), then
   classify the diff.
5. Concurrent session mutating the checkout → `git status` before/after
   long runs; a new failure in a previously-green package is probably not
   yours.

## Unified Puck contract (MANDATORY)

Non-negotiable. A violation is architecture-blocking: stop and resolve
before landing, never after.

1. **Puck is the sole editor contract**: `Config` + `Data` + the public
   `PuckApi` + `Render`. Nothing else defines what a document is or how it
   renders.
2. **Render state lives in declared fields**: node-level in declared
   component props/fields, document-level in declared root props/fields —
   nowhere else.
3. **One pipeline, four consumers**: editor, preview, production rendering,
   and export share the same `Config`, `Data`, migrations, and pure
   rendering/style pipeline. A behavioral difference between them is a bug.
4. **Public surface only**: Puck public APIs, Composition, `walkTree`,
   `transformProps` — all present in `@puckeditor/core@0.23.0`'s published
   types.
5. **Never introduce**: a parallel IR, an opaque root sidecar, a duplicated
   render pipeline, dependencies on undocumented Puck internals, or
   experimental Overrides as core architecture.
6. **Compliance must be explicit** in every PRD, design, plan, and code
   change. Silence is not compliance.
7. **On conflict, stop**: propose a Puck-native alternative or migration
   path and get agreement before writing code.

## Architecture contracts

- Each component is its own npm package (no umbrella), exporting
  `componentConfig`, `defaultProps`, `fields`, `metadata`. Render props are
  serializable — no functions/refs at top level. Wire new components into
  `apps/studio/lib/puck-demo.ts` and `transpilePackages` in
  `apps/studio/next.config.js`.
- Tailwind 4 is CSS-first — no `tailwind.config.js`. The
  `@anvilkit/tailwind-config` entries are NOT interchangeable:
  `/component` in component packages (preflight-free, source-scoped);
  `/shadcn` in apps + runtime CSS (`apps/studio`, `apps/docs`,
  `@anvilkit/core`, `canvas-editor`) — using it in a component package
  duplicates ~1.8 MB of preflight; `/postcss` for PostCSS config only.
- Generated docs under `apps/docs/content/docs/{components,api,templates}`
  are committed: run the owning `apps/docs` generator after component/
  plugin API changes; never hand-edit generated output. Vercel docs deploy
  uses `apps/docs` as root + `apps/docs/vercel.json`.

## TypeScript, React, styling

- `import type` for type-only imports (`verbatimModuleSyntax`). No circular
  deps (madge is a CI gate). `'use client'` on RSC-compatible paths using
  hooks/browser APIs. Respect size-limit budgets on publishable packages.
- Canvas iframe styles don't inherit parent CSS — inline styles or explicit
  host-style injection.
- i18n: message keys, never inline bilingual strings; no language-specific
  studio-app translation overrides unless explicitly requested. When
  regenerating docs/i18n content: escape YAML frontmatter values (esp.
  strings starting with `@`) and avoid unescaped JSX-like strings in MDX
  tables.
- All styling is Tailwind — no native CSS rules, CSS modules, CSS-in-JS, or
  styling libraries. Prefer existing utilities, semantic tokens, shadcn/ui
  components, reusable variants. `globals.css`: Tailwind imports, theme
  tokens, unavoidable base rules only. Inline styles only for
  runtime-computed values Tailwind can't express.

## Scope control

Edits stay strictly inside the packages named in the request. No
workspace-wide codegen/doc-regen/formatters touching unrelated packages —
if a tool does it anyway, revert the out-of-scope diffs before reporting
(`apps/docs` `generate:api` is the known offender: no per-package scope).
Prefer explicit per-file edits over `replace_all` and verify every intended
occurrence changed. Report any file touched outside the requested scope.

## Documents & PRDs

- PRDs/reviews/plans live under `docs/` with zero-padded 4-digit indexes
  per subdir: `docs/prd/` (singular), `plans/`, `reviews/`, `adr/`,
  `tasks/`, `analysis/`, `migration/`, `security/`; many carry a
  `-MMDD-HHMM` suffix. **List the target dir immediately before writing**
  to claim the next free index (concurrent sessions take them); never
  overwrite — back up or take the next index.
- Verify every claim against the actual source BEFORE writing, citing
  `file:line`. Re-verify claims restated from earlier documents; flag
  unverifiable ones; never cite an unconfirmed path.
- `.gitignore` keeps only `architecture/`, `adr/`, `policies/`,
  `migration/`, `security/` under `docs/` — prd/plans/reviews/tasks/
  analysis documents are working-only and vanish in a fresh clone; say so
  when handing one over.

## Submodules

Verify paths from `.gitmodules`:
`git config -f .gitmodules --get-regexp path`. Groups:
`packages/extensions/components`, `packages/extensions/plugins/*`,
`packages/capabilities/canvas/{core,editor}`,
`packages/capabilities/analytics/{core,react}` — the parent dirs are plain
directories. Submodule edits may not show in superproject status: inspect
inside the submodule working tree and call out which modified files live in
submodules.

## Working rules

- Analysis/audit/roadmap/review tasks: start the deliverable immediately;
  don't ask for plan approval unless blocked.
- Before editing shared code, enumerate call sites first
  (`wiring-enumerator` subagent or read-only exploration). Wiring Studio
  props/plugins → grep every `<Studio>` mount in studio-app paths.
- Before deleting files: grep inbound references; present the deletion list
  with reference counts.
- Refactors: root-cause fix + regression test over a band-aid. Verify every
  edit actually applied.
- Keep responses concise; write long reports to files. Portable shell
  (bash-only constructs only where a script already requires bash); scope
  `find`/`grep`/`rg` to the project, excluding `node_modules`, `dist`,
  `.claude/worktrees`.

## Skill routing

When a skill matches, use it before free-form work. The harness injects
each skill's description — below is only what it can't disambiguate.

- **User-invoked only** (tell the user to type them): `/add-component`
  (full rules: `packages/extensions/components/AGENTS.md`),
  `/release-prep`.
- **The four review skills**: `review` = pre-landing PR/diff review ·
  `adversarial-review` = audit one package from scratch, findings report
  file · `review-remediate` = review from scratch AND fix to green ·
  `review-fixes` = a findings report already exists; close every item.
- **Intent map**: bugs/500s → `investigate` · red CI/gates → `fixgates` ·
  ship/deploy/PR → `ship` · QA the site → `qa` · docs after shipping →
  `document-release` · product/build-worthiness → `office-hours` · design
  system/brand → `design-consultation` · visual polish → `design-review` ·
  architecture review → `plan-eng-review` · code health → `health` ·
  weekly retro → `retro`. Also: `phase-execute` (drive a PRD phase),
  `pre-refactor`, `react-doctor`, `gate-guardian` (classify gate failures
  via the playbook).
- **Read-only subagents** (`.claude/agents/`): `release-gate-triager`,
  `submodule-integrity`, `wiring-enumerator`.

If a listed skill is not installed, say so and continue with the closest
built-in workflow.
