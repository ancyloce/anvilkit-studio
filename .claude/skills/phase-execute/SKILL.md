---
name: phase-execute
description: |
  Phased PRD-driven execution for anvilkit-studio milestones. Given a PRD or
  plan reference and a target phase, decomposes the phase into atomic tasks,
  presents the plan for approval, then executes one task at a time — running
  typecheck/lint/test/build gates after each, then an automatic capped
  Codex review→revise loop (up to 2 revise rounds, output shown verbatim) —
  and waits for "continue" or "next" before advancing. Codifies the
  M9–M13 / Phase A–G workflow.
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

### 5b. Codex review loop (auto, capped, visible)

After §5 gates pass and **before** halting for `continue`, run an automatic
Codex review of the working-tree changes. This loop is **bounded** (cap = 2
revise rounds, 3 reviews total) and **visible** (verbatim Codex output is
printed to the user every round). Do **not** ask "should I review?" or
"should I apply fixes?" — those decisions are owned by this section.

**Invocation.** Run `/codex:review` non-interactively. Two equivalent paths;
pick whichever is available in the runtime:

- **Preferred** — invoke `/codex:review --wait` via the Skill tool. `--wait`
  is honored by `commands/review.md` and skips the foreground/background
  `AskUserQuestion` prompt.
- **Fallback** — call the companion script directly:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review --wait
  ```

**Scope.** Working-tree (uncommitted changes). This repo never auto-commits
during phase execution, so working-tree is the only meaningful scope.

**Timeout.** Hard 5-minute wall-clock per review round. Uncommitted-tree
reviews are known to hang occasionally on this repo. On timeout: treat the
loop as "review unavailable", **skip** further rounds for this task, and
record `codex: timeout` in the §6 `Notes` line.

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
  Tests: <before> → <after> (+<delta>)
  Gates: typecheck ✓  lint ✓  test ✓  build ✓
  Codex: <rounds> round(s), <resolved> resolved, <minor> minor remain, <blocking> blocking remain
  Notes: <anything surprising; pre-existing failures; follow-ups; codex timeouts>
```

Then halt for `continue` / `next`.

### 7. Phase completion

When all tasks in the phase are done:

- Run the full repo gates once more (typecheck + lint + test + build + madge
  - publint where applicable).
- Produce a phase summary: tasks completed, total test delta, files touched,
  any open follow-ups, any pre-existing infra issues encountered.
- Add a Codex aggregate line: total review rounds across the phase, tasks
  where the loop hit the cap with blockers still present, and tasks where
  the review timed out.
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
- **Bounded review autonomy.** The §5b Codex review→revise loop runs
  without asking, up to 2 revise rounds (3 reviews total). After that,
  halt and surface the remaining findings — never silently keep revising.
- **No silent edits.** Always print Codex's verbatim output before any
  revise edit. The user must be able to see what triggered each change.

## Optional: autonomous mode

If the user invokes with `--autonomous` (or says "run the whole phase /
milestone without stopping"), skip the per-task `continue` wait but keep the
per-task gate runs **and the §5b Codex review loop**. Halt only on: gate
failure after 3 retries, PRD ambiguity, any task requiring `rm` / file
deletion, or the §5b loop hitting its cap with blockers still present.

`--autonomous` does **not** raise the §5b cap. The 2-revise-round / 3-review
ceiling applies in every mode — uncommitted-tree review timeouts and
reviewer/executor disagreement make unbounded loops unsafe on this repo.
