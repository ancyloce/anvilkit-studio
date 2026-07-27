---
name: phase-execute
description: |
  Phased PRD-driven execution for anvilkit-studio milestones. Given a PRD or
  plan reference and a target phase, decomposes the phase into atomic tasks,
  presents the plan for approval, then executes one task at a time — running
  typecheck/lint/test/build gates after each, checkpointing every task to a
  resumable on-disk ledger, then an optional, `--codex`-gated capped Codex
  review→revise loop (up to 2 revise rounds, output shown verbatim) — and
  waits for "continue" or "next" before advancing. Codifies the M9–M13 /
  Phase A–G / PLAN-0020 workflow.
  Use when asked to "execute phase X of <plan>", "drive the next phase",
  "phase-execute <plan>", "resume the phase", or to advance a milestone with
  explicit gating.
triggers:
  - phase execute
  - execute phase
  - drive the next phase
  - advance the milestone
  - resume the phase
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

Two failure modes have cost the most time here, and §0/§5 exist to prevent
them: **an interrupted session losing a whole phase's context**, and
**a gate believed green that was never actually proven green**.

## Inputs

The user invokes this skill with a reference to a PRD or plan and (optionally)
a target phase. Plans and PRDs live under lowercase `docs/prd/`, `docs/plans/`,
and `docs/tasks/` (that whole tree is git-ignored — working state, not
published docs). Examples:

- `/phase-execute docs/prd/0012-anvilkit-canvas-core-editing-features.md --phase M4`
- `/phase-execute docs/plans/0020-core-visual-editor-implementation-plan-0722-1925.md --phase 4`
- `/phase-execute <plan>` (skill asks which phase)
- `/phase-execute <plan> --phase M2 --codex` (also run §5d after each task)
- `/phase-execute --resume` (pick up an interrupted run from its ledger)

Flags, all off by default and freely composable:

| Flag | Effect |
| --- | --- |
| `--phase <id>` | Target phase. If absent, ask before any other work. |
| `--autonomous` | Skip the per-task `continue` wait. Gates still run. |
| `--codex` | Enable the §5d Codex review→revise inspection. Also implied if the user explicitly asks for a "codex review" / "security review" / "best-practices review" of the phase work. |
| `--resume` | Read the ledger and continue from the first non-done task (§0). |

## Workflow

### 0. Session preflight — ledger, baseline, resume

Do this **before reading the plan**. It is cheap and it is what makes an
interrupted run recoverable.

**a. Confirm the authoritative checkout.**

```bash
pwd && git rev-parse --show-toplevel
```

Must be `/root/Rhett/anvilkit-studio`. Never execute a phase from
`.claude/worktrees/*` — those are real checkouts of other branches and hold
stale copies of this skill and of CLAUDE.md. Abort loudly if the paths differ.

**b. Locate or create the run ledger.**

The ledger lives at `docs/runs/<plan-slug>-<phase>.md` — git-ignored via
`/docs/*`, so it never pollutes the working tree the user reviews. Look for
it first:

```bash
ls docs/runs/ 2>/dev/null
```

- **Ledger exists** (or `--resume` was passed) → read it, report the last
  completed task and the first non-done one, and resume there. Do **not**
  re-run completed tasks; do re-run §5 gates once before continuing, because
  the tree may have moved since (see (c)).
- **No ledger** → create it after the §2 task list is approved, using the
  template in §6b. Never overwrite an existing ledger for the same phase;
  if one exists for a run the user considers finished, suffix the new one
  `-run2`.

**c. Snapshot the baseline.**

```bash
git log --oneline -3
git status --porcelain | wc -l
git status --porcelain > /tmp/phase-baseline.txt
```

Record the HEAD sha and the dirty-file count in the ledger header. **This
repo has concurrent writers**: another session/agent works it in parallel and
commits under the user's identity, and an auto-commit hook can move your own
edits out of `git status` before you look. The baseline is what lets you tell
their churn from yours in §5.

### 1. Read the plan, identify the phase

- Read the PRD/plan file end-to-end.
- Locate the target phase section. Quote its scope and acceptance criteria
  back to the user in 3–6 lines so we're aligned before decomposing.
- If the phase references shared contracts (adapter interfaces, IR types,
  registry methods) spanning packages, list them — that is the integration
  boundary. Shared types are owned by `@anvilkit/contracts`.
- Check for a matching task file under `docs/tasks/` before decomposing; many
  phases are already broken down there.

### 2. Decompose, and declare a scope contract

- Break the phase into 3–8 atomic tasks. Each must be independently
  verifiable and committable.
- Register them with TaskCreate. One task = one logical change = one gate run.
  TaskCreate is in-session only — the **ledger (§6b) is the durable record**.
- Alongside the task list, state an explicit **scope contract**:

  ```
  Scope contract for <plan> <phase>
    May edit:   <explicit path allowlist — packages/dirs, not "the repo">
    May read:   anything
    Will NOT:   commit, push, run workspace-wide codegen/formatters,
                touch packages outside the allowlist, or weaken any gate
    Verify cmd: <the per-task gate command set from §5>
  ```

- Present task list + scope contract to the user **before any edits** and wait
  for `continue`, `next`, `go`, or similar. Under `--autonomous`, still print
  both, then proceed.
- If a later task needs a path outside the allowlist, surface it as a
  follow-up and ask — do not widen the contract silently.

### 3. Pre-edit discovery (refactors / multi-mount changes)

- For `<Studio>` / `<CanvasStudio>` mount changes, new plugin wiring, or a new
  component package, spawn the **`wiring-enumerator`** agent — it reports
  every mount and wiring site (file:line) with wiring status across studio,
  docs, and core.
- For any other broad call-site sweep, spawn **`Explore`** and keep only the
  findings in this conversation.
- Enumerate **before editing**. Both the default and collab paths must be
  wired. New components must additionally be wired into
  `apps/studio/lib/puck-demo.ts` and `transpilePackages` in
  `apps/studio/next.config.js`.

### 4. Execute one task at a time

For each task:

1. Mark it `in_progress` via TaskUpdate.
2. Run the CLAUDE.md `## Reuse-First Engineering` pre-code check before writing
   any new helper, hook, wrapper, component, abstraction, or dependency. New
   dependencies require explicit user confirmation.
3. Make edits scoped strictly to the task's allowlist paths.
4. **Prove every edit landed** (§4a).
5. Run the gates (§5), then §5d if `--codex`.
6. Report per §6a and append the ledger row per §6b.
7. Mark `completed` via TaskUpdate.
8. **Halt and wait** for `continue` / `next` (unless `--autonomous`).

If a task involves deleting any file, first grep inbound references, present
the deletion list with reference counts, and wait for explicit approval before
any `rm`.

#### 4a. Prove the edit landed

An edit reported as applied is not evidence it was applied everywhere it
needed to be. Before running gates:

- **Never trust `replace_all` for a multi-occurrence change.** It matches one
  exact string; a different indentation, a trailing comma, or a line break
  silently leaves occurrences behind. After any `replace_all`, grep the old
  pattern and confirm **zero** remaining hits — scoped to the project, always
  excluding `node_modules` and `.claude/worktrees` (the latter silently
  doubles every hit).
- After a rename or signature change, grep the **old** symbol repo-wide and
  confirm the only hits are intentional (changelogs, migration docs).
- If a file you edited also appears in the §0 baseline as already-dirty,
  re-read it before gating — a concurrent writer may share it.

**Hooks fire mid-task — expect them:**

- `git commit` / `git push` are hard-blocked by a PreToolUse hook. A blocked
  call is the policy working, not a gate failure. Never route around it.
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

For phases touching specific packages, add:

- Any changed package → `pnpm --filter <pkg> check:all` (the manifest-
  discovered aggregate; `pnpm check:push` runs it for everything changed vs
  `origin/main` and is what the pre-push hook enforces)
- Any publishable package → `pnpm publint` and `pnpm size`
- Structural / import-graph changes → `pnpm madge`
- `@anvilkit/core` editor-engine changes → `pnpm --filter @anvilkit/core
  bench:editor` (7 §28 metrics, fails on budget violation or >10% regression)

#### 5a. Evidence rule — a gate is not green until it printed a result

Most false "all green" reports in this repo came from reading absent output as
success. Therefore:

- **Quote the numeric result line** for each gate (test files/tests counts,
  package counts). "Passed" with nothing to cite is not a pass.
- **Empty output is a FAILURE, not a pass.** So is a run that ended before
  emitting a summary. Investigate; never report it green.
- **A pipe hides the real exit code.** `pnpm x 2>&1 | tail -60` reports the
  *pipe's* status (0), not pnpm's. Scan the tail text for `ELIFECYCLE` /
  `exited with status`, or use `${PIPESTATUS[0]}`.
- **Record before → after test counts** per task; a delta of 0 on a task that
  claimed new tests is a red flag worth one minute of checking.
- Do not claim a check passed unless it was actually executed; report the
  exact command.

#### 5b. Triage a failure before fixing it

- **Code issue** → fix within task scope and re-run.
- **Module-resolution error** → rebuild affected packages with `pnpm build`
  before assuming it is a code problem.
- **Concurrent-session churn** → a package that passed earlier in this phase
  and now fails is often another session's commit. Re-run
  `git status --porcelain`, diff against the §0 baseline, and check
  `git log --oneline -8` for commits you did not make (recent timestamps are
  the giveaway). If it is theirs: report it, do not fix their in-flight
  files, and continue with work that does not depend on them. Note that
  `git stash` probing does not work here — the auto-commit hook may have
  already committed your edits.
- **Suspected flake** → re-run that spec alone 3×. Any pass ⇒ flaky: record it
  in the ledger's Flakes section with the command and move on. 3 failures ⇒
  real, fix it. Do not burn the phase's budget re-running a full suite to
  chase one nondeterministic spec.
- **Pre-existing infra issue** → report clearly, never silently skip. When the
  pre-existing-vs-regression call is not obvious, spawn the
  **`release-gate-triager`** agent — it runs `check:all` per changed package
  in isolation and classifies each failure against this repo's known patterns
  (api-snapshot drift, bundle-size overflow, concurrency phantoms, classic-JSX
  runtime breaks).
- **Three failed retries** → halt and ask the user how to proceed.

Never weaken tests, lint rules, type checks, or size budgets to get green.

#### 5c. E2E preflight and postflight

E2E on this box is the single largest source of wasted cycles. `apps/studio`'s
`playwright.config.ts` sets `reuseExistingServer: true` locally, so Playwright
**attaches to whatever already holds :3000** instead of booting clean.

**Preflight — every E2E run:**

1. If you rebuilt any workspace package's `dist` this session, the running
   `next dev` still has the **old modules resident**, and every editor spec
   fails with a missing `ak-write-target` that looks exactly like your code
   broke the editor. Check whether the server predates your rebuild:

   ```bash
   ps -o lstart= -p $(ss -tlnp | grep :3000 | grep -oP 'pid=\K[0-9]+')
   ```

   If it started earlier: kill it, `rm -rf apps/studio/.next`, and let
   Playwright boot fresh (pay the 60–90 s cold compile).
2. A killed Playwright run orphans a zombie `next dev` holding its port.
   **Boot on a fresh `PORT` rather than fighting it** — faster and safer than
   hunting PIDs. WSL2 also inherits Windows port reservations, so a port can
   be blocked with an empty `ss` listing.
3. Use `--workers=1` on this box. Use unique room IDs for collab specs.
4. Run the **pre-existing baseline spec first** (e.g.
   `e2e/editor/visual-editor.spec.ts`). If it fails identically to your new
   spec, the cause is environmental, not your code — say so instead of
   debugging the new spec.

**Postflight — before reporting anything:**

- Assert the reporter printed a **non-zero passed count**. Empty output or
  `0 passed` is FAILED (§5a), never green.
- If the suite could not complete for environmental reasons (WSL2 compile
  timeouts, headless Chromium screenshot hangs), record it in the ledger as
  `blocked: env` with the evidence — do not report the task green, and do not
  report it as a code regression either.

For UI behavior, drive the real app with `/run` — not unit tests alone.

#### 5d. Codex review loop (opt-in via `--codex`, capped, visible)

Runs **only when `--codex` was passed**; otherwise skip entirely and go to §6.
Once enabled, do not ask "should I review?" or "should I apply fixes?" — this
section owns those decisions.

After §5 gates pass and **before** halting for `continue`, review the
working-tree changes. Bounded to **2 revise rounds / 3 reviews**, in every
mode including `--autonomous`. Do not raise the cap without editing this file.

**Invocation.** Via the Skill tool: `/codex:review --wait --scope working-tree`.
`--wait` skips the plugin's foreground/background prompt. Do not copy the
plugin's `${CLAUDE_PLUGIN_ROOT}` invocation — that variable is empty here;
resolve the script if needed with
`ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs`.

**Scope.** Working-tree only. This repo never auto-commits during phase
execution, so `--base main` finds no committed diff.

**Timeout.** Hard 5 minutes per round. Repo-wide uncommitted review is **known
to hit the 124 timeout here** (it scans submodule churn and auto-runs the slow
project `tsc --noEmit`). On timeout: treat as "review unavailable", skip
further rounds for this task, record `codex: timeout` in §6a. If a second
opinion is still wanted, fall back to a scoped `codex exec -s read-only` whose
prompt (a) runs exactly `git diff -- <task paths>` plus reads named new files,
(b) forbids build/tsc/test runs, (c) ignores submodules and the generated
`api-snapshot.json` — stash a regenerated snapshot so its multi-thousand-line
diff doesn't dominate.

**Visibility.** Print Codex stdout **verbatim** before acting on it. The user
must always see what triggered a revise edit.

**Classification.** *Blocking* = correctness bugs, security issues, broken
contracts, regressions of the phase's acceptance criteria, or anything labeled
`bug` / `incorrect` / `broken` / `vulnerability` / `regression` / `must-fix` /
`critical` / `high`. *Minor* = `nit` / `consider` / `could` / `suggestion` /
`style` / naming / optional refactor / `low` / `info`. **Ambiguous ⇒ minor** —
revising on ambiguous output is how loops become unbounded.

**Loop.** Review → if only minor, exit to §6. If blocking, apply **minimal**
fixes scoped to those findings only (no opportunistic refactors), re-run §5
gates (the 3-retry rule still applies), and review again. After the 3rd review,
if blocking findings remain: **halt**, summarize the survivors verbatim, and
wait for the user. Log per round:
`Codex round <n>: <blocking> blocking, <minor> minor` + verbatim stdout.

### 6. Per-task report and checkpoint

#### 6a. Report format

```
Task <n>: <title> — DONE
  Files: <N changed> (<list>)
  Submodule files: <list, or none>
  Tests: <before> → <after> (+<delta>)
  Gates: typecheck ✓ (<evidence>)  lint ✓  test ✓ (<N files, M tests>)  build ✓
  Drift: <clean vs §0 baseline | files changed by another session>
  Codex: <rounds> round(s), <resolved> resolved, <minor> minor, <blocking> remain
  Notes: <surprises; pre-existing failures; quarantined flakes; follow-ups>
```

List submodule files separately — edits inside submodules may not show in
superproject status, so inspect inside the submodule working tree rather than
trusting root `git status`. Omit `Codex:` when `--codex` was not passed.

#### 6b. Ledger checkpoint (do this every task, before halting)

Append the task's row to `docs/runs/<plan-slug>-<phase>.md` **immediately**
after gates pass — before the `continue` wait, before anything else. A session
limit or crash then costs one task, not the phase. Create it on first use as:

```markdown
# Phase run: <plan> — <phase>

- Started: <YYYY-MM-DD>  ·  Checkout: /root/Rhett/anvilkit-studio
- Baseline HEAD: <sha>  ·  Baseline dirty files: <n>
- Flags: <--codex / --autonomous / none>
- Scope contract: <allowlist>

## Tasks

| # | Task | Status | Gates | Tests | Files | Notes |
| - | ---- | ------ | ----- | ----- | ----- | ----- |

## Quarantined flakes

## Follow-ups (out of scope, surfaced during the run)
```

Append rows with a shell redirect rather than a full rewrite, so a partial
write can never destroy earlier checkpoints. `Status` is one of `done`,
`failed`, `blocked: env`, `blocked: user`.

On resume, this table — not the conversation, not TaskList — is the source of
truth for what already happened.

### 7. Phase completion

- Re-run the full repo gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm build`, plus `pnpm madge` / `pnpm publint` where applicable.
  `pnpm check:push` is the closest single proxy for the pre-push hook.
- Re-check drift against the §0 baseline one last time and re-read any file
  you edited that a concurrent session also touched.
- Produce a phase summary: tasks completed, total test delta, files touched
  (superproject and submodule, listed separately), quarantined flakes, open
  follow-ups, pre-existing infra issues.
- **Docs codegen is workspace-wide — treat it as out of scope by default.**
  `pnpm generate:api` has no per-package flag: it walks every package with an
  `api-snapshot.json` and has regenerated 1000+ files across unrelated
  packages, and it fails outright if any other package's `dist/types` is
  mid-build. If the phase changed component/plugin APIs, prefer telling the
  user to run it at a clean point. If you do run it and it touches more than
  `apps/docs/content/docs/api/<pkg>/**` plus
  `apps/docs/.api-snapshots/<pkg>.json`, revert the rest
  (`git checkout --` for tracked, `git clean -fd --` for generated untracked).
- Write long reports to a file under `docs/reviews/` — **never overwrite an
  existing plan/report file**; check first and back it up.
- Mark the ledger complete and ask whether to advance to the next phase.

## Hard rules

CLAUDE.md's rules apply in full and are not repeated here (git read-only,
Biome/TAB formatting, Reuse-First, never weaken a gate). Skill-specific:

- **One task at a time.** No batching or parallel tasks unless `--autonomous`.
- **Checkpoint before you wait.** The ledger row is written before the
  `continue` halt, always.
- **No scope drift.** Work outside the §2 allowlist becomes a follow-up note,
  never a silent expansion.
- **Evidence over assertion.** Every green claim cites its command and its
  numeric result (§5a).
- **Stop on real ambiguity.** If the PRD is unclear about what a phase
  requires, ask before guessing.
- **Bounded review autonomy.** With `--codex`, §5d runs unasked up to 2 revise
  rounds, then halts with the survivors. Never silently keep revising.
- **No silent edits.** Print Codex's verbatim output before any revise edit.

## Optional: autonomous mode

With `--autonomous` (or "run the whole phase without stopping"), skip the
per-task `continue` wait but keep every gate run, every ledger checkpoint, and
— with `--codex` — the §5d loop. Halt only on: gate failure after 3 retries,
PRD ambiguity, a task requiring `rm` / file deletion, a new dependency, work
outside the scope contract, or §5d hitting its cap with blockers remaining.

`--autonomous` does **not** raise the §5d cap. Long unattended runs are
exactly where an unbounded revise loop or an unproven "green" does the most
damage — the ledger and §5a are what make this mode safe to leave alone.
