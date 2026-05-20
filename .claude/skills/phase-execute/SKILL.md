---
name: phase-execute
description: |
  Phased PRD-driven execution for anvilkit-studio milestones. Given a PRD or
  plan reference and a target phase, decomposes the phase into atomic tasks,
  presents the plan for approval, then executes one task at a time — running
  typecheck/lint/test/build gates after each — and waits for "continue" or
  "next" before advancing. Codifies the M9–M13 / Phase A–G workflow.
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
---

# Phase Execute

Codifies the PRD → phase decomposition → gated execution rhythm used across
M9–M13 and Phase A–G milestones in this repo.

## Inputs

The user invokes this skill with a reference to a PRD or plan and (optionally)
a target phase. Examples:

- `/phase-execute docs/PRD/<plan>.md --phase M11`
- `/phase-execute docs/plans/sidebar-modules.md --phase F`
- `/phase-execute <plan>` (skill asks which phase)

If no phase is specified, ask which phase to execute before any other work.

## Workflow

### 1. Read the plan, identify the phase

- Read the PRD/plan file end-to-end.
- Locate the target phase section. Quote the phase's scope and acceptance
  criteria back to the user in 3–6 lines so we're aligned before decomposing.
- If the phase references shared contracts (adapter interfaces, IR types,
  registry methods) that span packages, list them — these are the integration
  boundary.

### 2. Decompose into atomic tasks

- Break the phase into 3–8 atomic tasks. Each task should be independently
  verifiable and committable.
- Use TaskCreate to register them. One task = one logical change with its own
  gate run.
- Present the task list to the user for approval **before any edits**. Do not
  begin editing until the user replies with `continue`, `next`, `go`, or
  similar.

### 3. Pre-edit discovery (for refactors / multi-mount changes)

Per CLAUDE.md `## Sub-agent usage` and `## Demo & Mount Consistency`:

- If the task involves refactoring a component, threading new props, or
  wiring a new plugin, spawn an Explore sub-agent to enumerate every call
  site (file:line) **before editing**.
- For `<Studio>` mount changes specifically: search `apps/demo/` for every
  mount and list wiring status for each. Both the default and collab paths
  must be wired.

### 4. Execute one task at a time

For each task:

1. Mark the task `in_progress` via TaskUpdate.
2. Make the edits scoped strictly to the task. Never modify files outside
   the task's stated scope.
3. Run the gates (see §5).
4. Report gate results + test count delta + any files touched.
5. Mark `completed` via TaskUpdate.
6. **Halt and wait** for the user to reply `continue` or `next` before
   starting the next task.

Per CLAUDE.md `## Safe Deletion`: if a task involves deleting any file, grep
for inbound references first, present a deletion list with reference counts,
and wait for explicit approval before any `rm`.

### 5. Verification gates

After every task, run in this order:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If a gate fails:

- **Code issue** → fix it within the task scope and re-run.
- **Pre-existing infra issue** (path aliases, missing dist folders, known
  flakes per memory) → report it clearly, do not silently skip. Per CLAUDE.md
  `## Verification Gates`, build dependent packages with `pnpm build` before
  assuming module resolution errors are code problems.
- **Three failed retries** → halt and ask the user how to proceed.

For phases touching specific packages, add the package-local gates too:

- `@anvilkit/core` → `pnpm --filter @anvilkit/core check:all`
- IR / schema / validator / plugin-export-\* / plugin-ai-copilot → their
  Phase 3 release gates
- Any publishable package → `pnpm publint` and `pnpm size`

### 6. Per-task report format

After gates pass, report in this shape:

```
Task <n>: <title> — DONE
  Files: <N changed> (<list>)
  Tests: <before> → <after> (+<delta>)
  Gates: typecheck ✓  lint ✓  test ✓  build ✓
  Notes: <anything surprising; pre-existing failures; follow-ups>
```

Then halt for `continue` / `next`.

### 7. Phase completion

When all tasks in the phase are done:

- Run the full repo gates once more (typecheck + lint + test + build + madge
  - publint where applicable).
- Produce a phase summary: tasks completed, total test delta, files touched,
  any open follow-ups, any pre-existing infra issues encountered.
- Ask whether to advance to the next phase or stop.

## Hard rules

- **Never commit.** Per memory: user handles all commits. Leave staged/
  unstaged for them.
- **One task at a time.** Do not batch tasks or run multiple in parallel
  unless the user explicitly asks for autonomous mode.
- **No scope drift.** If a task surfaces work outside its scope, surface it
  as a follow-up note and continue with the original task. Do not silently
  expand.
- **Stop on real ambiguity.** If the PRD is unclear about what a phase
  requires, ask before guessing.

## Optional: autonomous mode

If the user invokes with `--autonomous` (or says "run the whole phase /
milestone without stopping"), skip the per-task `continue` wait but keep the
per-task gate runs. Halt only on: gate failure after 3 retries, PRD
ambiguity, or any task requiring `rm` / file deletion.
