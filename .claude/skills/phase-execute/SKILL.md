---
name: phase-execute
description: |
  Phased PRD-driven execution for anvilkit-studio milestones. Given a PRD or
  plan reference and a target phase, decomposes the phase into atomic tasks,
  presents the plan for approval, then executes one task at a time — running
  typecheck/lint/test/build gates after each, then an optional,
  `--codex`-gated capped Codex review→revise loop (up to 2 revise rounds,
  output shown verbatim) —
  and waits for "continue" or "next" before advancing. Codifies the
  M9–M13 / Phase A–G / PLAN-0020 workflow.
  Use when asked to "execute phase X of <plan>", "drive the next phase",
  "phase-execute <plan>", or to advance a milestone with explicit gating.
triggers:
  - phase execute
  - execute phase
  - drive the next phase
  - advance the milestone
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - Skill
  - TaskCreate
  - TaskUpdate
  - TaskList
---

# Phase Execute

Codifies the PRD → phase decomposition → gated execution rhythm used across
M9–M13, Phase A–G, and the PLAN-0020 phases in this repo.

## Inputs

The user invokes this skill with a reference to a PRD or plan and (optionally)
a target phase. Plans and PRDs live under lowercase `docs/prd/`, `docs/plans/`,
and `docs/tasks/` (that whole tree is git-ignored — it is working state, not
published docs). Examples:

- `/phase-execute docs/prd/0012-anvilkit-canvas-core-editing-features.md --phase M4`
- `/phase-execute docs/plans/0020-core-visual-editor-implementation-plan-0722-1925.md --phase 4`
- `/phase-execute <plan>` (skill asks which phase)
- `/phase-execute docs/prd/0016-....md --phase M2 --codex` (also run the §5b
  Codex review inspection after each task)

If no phase is specified, ask which phase to execute before any other work.
Pass `--codex` to enable the §5b Codex review→revise inspection; it is **off
by default** and composes with `--autonomous`.

## Workflow

### 1. Read the plan, identify the phase

- Read the PRD/plan file end-to-end.
- Locate the target phase section. Quote the phase's scope and acceptance
  criteria back to the user in 3–6 lines so we're aligned before decomposing.
- If the phase references shared contracts (adapter interfaces, IR types,
  registry methods) that span packages, list them — these are the integration
  boundary. Per CLAUDE.md `## Architecture Contracts`, shared types are owned
  by `@anvilkit/contracts`.
- Check for a matching task file under `docs/tasks/` before decomposing; many
  phases are already broken down there.

### 2. Decompose into atomic tasks

- Break the phase into 3–8 atomic tasks. Each task should be independently
  verifiable and committable.
- Use TaskCreate to register them. One task = one logical change with its own
  gate run.
- Present the task list to the user for approval **before any edits**. Do not
  begin editing until the user replies with `continue`, `next`, `go`, or
  similar.

### 3. Pre-edit discovery (for refactors / multi-mount changes)

Per CLAUDE.md `## Working Rules` ("Before editing shared code, enumerate call
sites first" / "Use read-only exploration or subagents when available for
large call-site searches" / "When wiring Studio props/plugins, grep all
`<Studio>` mounts in studio-app paths"):

- For `<Studio>` / `<CanvasStudio>` mount changes, new plugin wiring, or a new
  component package, spawn the **`wiring-enumerator`** agent — it is purpose-
  built to report every mount and wiring site (file:line) with wiring status
  across studio, docs, and core.
- For any other broad call-site sweep, spawn **`Explore`** and keep only the
  findings in this conversation.
- Either way, enumerate **before editing**. Both the default and collab paths
  must be wired.
- New components must additionally be wired into `apps/studio/lib/puck-demo.ts`
  and `transpilePackages` in `apps/studio/next.config.js`.

### 4. Execute one task at a time

For each task:

1. Mark the task `in_progress` via TaskUpdate.
2. Run the CLAUDE.md `## Reuse-First Engineering` pre-code check before writing
   any new helper, hook, wrapper, component, abstraction, or dependency. New
   dependencies require explicit user confirmation.
3. Make the edits scoped strictly to the task. Never modify files outside
   the task's stated scope.
4. Run the gates (see §5).
5. Report gate results + test count delta + any files touched (see §6).
6. Mark `completed` via TaskUpdate.
7. **Halt and wait** for the user to reply `continue` or `next` before
   starting the next task.

Per CLAUDE.md `## Working Rules` ("Before deleting files, grep inbound
references and present a deletion list with reference counts"): if a task
involves deleting any file, do that grep first, present the deletion list with
reference counts, and wait for explicit approval before any `rm`.

**Hooks fire mid-task — expect them** (CLAUDE.md `## Active Hooks`):

- `git commit` / `git push` are hard-blocked by a PreToolUse hook. Do not
  attempt them; a blocked call is not a gate failure.
- Writes under any `dist/` are blocked. Edit source and rebuild — rslib wipes
  `dist/` anyway.
- Biome autoformats every file written via Write/Edit, immediately after the
  write. Do not re-format or "fix" the result by hand.
- JSX without a React binding is **blocked** in `packages/extensions/plugins/**`
  and `packages/capabilities/canvas/**` `.tsx`. Those build classic JSX, so a
  missing binding throws `React is not defined` at runtime from `dist` and
  **typecheck will not catch it**. Add `import * as React from "react";`.

### 5. Verification gates

After every task, run in this order:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Use `typecheck`, never `check-types`.

If a gate fails:

- **Code issue** → fix it within the task scope and re-run.
- **Pre-existing infra issue** (path aliases, missing dist folders, known
  flakes per memory) → report it clearly, do not silently skip. Per CLAUDE.md
  `## Verification / Definition of Done`, rebuild affected packages with
  `pnpm build` before assuming module-resolution errors are code problems.
  When the pre-existing-vs-regression call is not obvious, spawn the
  **`release-gate-triager`** agent — it runs `check:all` per changed package in
  isolation and classifies each failure against this repo's known patterns
  (api-snapshot drift, bundle-size overflow, concurrency phantoms,
  classic-JSX runtime breaks).
- **Concurrent-session churn** → a new failure in a package that passed earlier
  in the same phase is often another session's commit, not your edit. Check
  `git log` before debugging it as yours.
- **Three failed retries** → halt and ask the user how to proceed.

Never weaken tests, lint rules, type checks, or size budgets to get green
(CLAUDE.md `## Hard Rules`).

For phases touching specific packages, add the package-local gates too:

- Any changed package → `pnpm --filter <pkg> check:all` (the manifest-
  discovered aggregate gate; `pnpm check:push` runs it for everything changed
  vs `origin/main`, and is what the pre-push hook enforces)
- Any publishable package → `pnpm publint` and `pnpm size`
- Structural / import-graph changes → `pnpm madge` (CI gate; does not replace
  the layer rules in `docs/architecture/repository-structure.md`)

For UI behavior, drive the real app with `/run` — not unit tests alone. For
E2E, use unique room IDs and avoid port collisions. Do not claim a check
passed unless it was actually executed; report the exact command.

### 5b. Codex review loop (opt-in via `--codex`, capped, visible)

This loop runs **only when the user passed `--codex`** (see Inputs). Without
`--codex`, skip §5b entirely and proceed straight to §6 — no `/codex:review`
call, no revise loop.

When `--codex` is set, after §5 gates pass and **before** halting for
`continue`, run a Codex review of the working-tree changes. This loop is
**bounded** (cap = 2 revise rounds, 3 reviews total) and **visible** (verbatim
Codex output is printed to the user every round). Once `--codex` has enabled
the loop, do **not** ask "should I review?" or "should I apply fixes?" — those
decisions are owned by this section.

**Invocation.** Run `/codex:review` non-interactively:

```
/codex:review --wait --scope working-tree
```

`--wait` is honored by the codex plugin's `commands/review.md` and skips its
foreground/background `AskUserQuestion` prompt. Invoke it via the Skill tool.

Do **not** copy the plugin's own `${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs`
invocation into this skill — that variable is only set inside the codex
plugin's own commands and will be empty here. If you need the script directly,
resolve it first:

```bash
ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs
```

**Scope.** Working-tree (uncommitted changes). This repo never auto-commits
during phase execution, so working-tree is the only meaningful scope — and
`--base main` finds no committed diff for the same reason.

**Timeout.** Hard 5-minute wall-clock per review round. Repo-wide uncommitted
review is **known to hit the 124 timeout on this repo**: it scans submodule
churn and auto-runs the slow project `tsc --noEmit`. On timeout: treat the
loop as "review unavailable", **skip** further rounds for this task, and
record `codex: timeout` in the §6 `Notes` line.

If a second opinion is still wanted after a timeout, fall back to a scoped
read-only run instead of retrying the wrapper: `codex exec -s read-only` with a
prompt that (a) runs exactly `git diff -- <the task's paths>` plus reads named
new files, (b) forbids build/tsc/test runs, (c) ignores submodules and the
generated `api-snapshot.json`. Stash a regenerated `api-snapshot.json` while
reviewing so its multi-thousand-line generated diff doesn't dominate.

**Visibility.** Print the Codex stdout **verbatim** before doing anything
else with it. The user must always see what triggered any revise edit.

**Classification rubric.** After each review, read Codex's output and bucket
findings into:

- **Blocking** — correctness bugs, security issues, broken contracts,
  regressions of the phase's acceptance criteria, or anything Codex labels
  with `bug`, `incorrect`, `broken`, `vulnerability`, `regression`,
  `must-fix`, `critical`, or `high`.
- **Minor** — `nit`, `consider`, `could`, `suggestion`, `style`, naming,
  optional refactor, `low`, `info`.

If classification is ambiguous, treat the finding as **minor** (do not
revise on ambiguous output — that's how unbounded loops happen).

**Loop.**

1. **Round 1.** Run review. If only minor → exit loop, proceed to §6.
2. If blocking → apply **minimal** fixes scoped to those findings only
   (no opportunistic refactors), re-run §5 gates. Gate failures inside
   the revise step still follow §5's 3-retry rule.
3. **Round 2.** Run review again. If only minor → exit loop.
4. If blocking again → apply minimal fixes, re-run §5 gates.
5. **Round 3 (final check).** Run review. If only minor → exit loop.
6. If round 3 **still** reports blocking → **halt**. Summarize remaining
   blockers (Codex's verbatim findings + which ones survived revise) and
   wait for the user's `continue` / `next`. Do not revise further.

**Hard cap.** 2 revise rounds. 3 reviews max. This cap applies in every
mode, including `--autonomous`. Do not raise it without changing this file.

**Per-round logging.** Record for each round:

```
Codex round <n>: <blocking-count> blocking, <minor-count> minor
<verbatim Codex stdout>
```

These feed the §6 `Codex:` summary line.

### 6. Per-task report format

After gates pass, report in this shape:

```
Task <n>: <title> — DONE
  Files: <N changed> (<list>)
  Submodule files: <list, or none>
  Tests: <before> → <after> (+<delta>)
  Gates: typecheck ✓  lint ✓  test ✓  build ✓
  Codex: <rounds> round(s), <resolved> resolved, <minor> minor remain, <blocking> blocking remain
  Notes: <anything surprising; pre-existing failures; follow-ups; codex timeouts>
```

List submodule files separately: per CLAUDE.md `## Submodules`, edits inside
submodules may not show in superproject status, so inspect inside the
submodule working tree rather than trusting root `git status`.

Omit the `Codex:` line when `--codex` was not passed. Then halt for
`continue` / `next`.

### 7. Phase completion

When all tasks in the phase are done:

- Run the full repo gates once more: `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, `pnpm build`, plus `pnpm madge` and `pnpm publint` where
  applicable. `pnpm check:push` is the closest single proxy for what the
  pre-push hook will run.
- Produce a phase summary: tasks completed, total test delta, files touched
  (superproject and submodule, listed separately), any open follow-ups, any
  pre-existing infra issues encountered.
- If the phase changed component or plugin APIs, run the owning `apps/docs`
  generator — generated content under
  `apps/docs/content/docs/{components,api,templates}` is committed.
- If `--codex` was passed, add a Codex aggregate line: total review rounds
  across the phase, tasks where the loop hit the cap with blockers still
  present, and tasks where the review timed out.
- Write any long report to a file under `docs/reviews/` or `docs/plans/`
  rather than inline — and **never overwrite an existing plan/report file**;
  check first and back it up.
- Ask whether to advance to the next phase or stop.

## Hard rules

- **Git is read-only.** Per CLAUDE.md `## Hard Rules` and memory: never stage,
  commit, amend, rebase, merge, reset, clean, tag, push, switch branches, or
  open PRs. Leave everything unstaged and summarize what changed. Read-only
  git (`status`, `diff`, `log`, `show`, `branch`, `submodule status`) is fine.
- **Work in the authoritative checkout** (`/root/Rhett/anvilkit-studio`), not a
  staging or worktree copy. Note that `.claude/worktrees/*` contains stale
  copies of this skill and of CLAUDE.md — never edit or read those as truth.
- **One task at a time.** Do not batch tasks or run multiple in parallel
  unless the user explicitly asks for autonomous mode.
- **No scope drift.** If a task surfaces work outside its scope, surface it
  as a follow-up note and continue with the original task. Do not silently
  expand.
- **Reuse before writing.** No new utility, wrapper, hook, component,
  abstraction, or dependency without passing the Reuse-First check in §4.2.
- **Never weaken a gate to get green.** Report pre-existing failures instead.
- **Formatting is Biome with TAB indentation.** Never run Prettier; never
  introduce CRLF.
- **Stop on real ambiguity.** If the PRD is unclear about what a phase
  requires, ask before guessing.
- **Bounded review autonomy.** When `--codex` is passed, the §5b Codex
  review→revise loop runs without asking, up to 2 revise rounds (3 reviews
  total). After that, halt and surface the remaining findings — never
  silently keep revising.
- **No silent edits.** Always print Codex's verbatim output before any
  revise edit. The user must be able to see what triggered each change.

## Optional: autonomous mode

If the user invokes with `--autonomous` (or says "run the whole phase /
milestone without stopping"), skip the per-task `continue` wait but keep the
per-task gate runs **and, when `--codex` is also passed, the §5b Codex review
loop**. Halt only on: gate failure after 3 retries, PRD ambiguity, any task
requiring `rm` / file deletion, a new dependency, or — with `--codex` — the
§5b loop hitting its cap with blockers still present.

`--autonomous` does **not** raise the §5b cap. The 2-revise-round / 3-review
ceiling applies in every mode — uncommitted-tree review timeouts and
reviewer/executor disagreement make unbounded loops unsafe on this repo.

## Optional: Codex review (`--codex`)

The §5b Codex review→revise inspection is **opt-in**. It runs only when the
user passes `--codex` (e.g. `/phase-execute <plan> --phase M11 --codex`) or
explicitly asks for a "codex review" / "security review" / "best-practices
review" of the phase work.

- **Default (no `--codex`):** run §1–§5 and §6–§7 as written, but **skip
  §5b**. Do not invoke `/codex:review`, do not print a `Codex:` report line,
  and do not open a review→revise loop on your own.
- **With `--codex`:** run the full §5b loop after each task's §5 gates pass —
  bounded to 2 revise rounds / 3 reviews, verbatim output shown every round,
  exactly as §5b specifies.

`--codex` composes with `--autonomous`: pass both to run every task without
the `continue` wait *and* with the Codex inspection after each. Neither flag
raises the §5b hard cap (2 revise rounds, 3 reviews).
