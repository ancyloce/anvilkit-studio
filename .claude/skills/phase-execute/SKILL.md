---
name: phase-execute
description: |
  Self-healing autonomous phase runner for numbered implementation plans
  (docs/plans/*, docs/prd/*). Executes a phase task-by-task with no per-task
  approval wait: scoped gates after every task (typecheck + lint + affected
  package tests), the full repo-wide gate only at phase boundaries, and a
  checkpoint to .claude/state/phase-run.json after EVERY task so an
  interrupted run resumes from the exact next task without re-exploring the
  baseline. Cleans orphaned Playwright/dev-server state before any E2E run
  and never lets Playwright boot its own server. Retries a failing spec up to
  3 times: pass-on-retry is quarantined to docs/flaky-tests.md; 3 identical
  failures stop the phase with a diagnostic report. Guards every edit against
  concurrent checkout mutation via file-hash re-verification. Emits
  docs/reports/phase-<N>-deliverables.md at phase end.
  Use when asked to "execute phase X of <plan>", "drive the next phase",
  "phase-execute <plan>", "resume the phase", or "dry-run phase X".
triggers:
  - phase execute
  - execute phase
  - drive the next phase
  - advance the milestone
  - resume the phase
  - dry-run the phase
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

# Phase Execute — self-healing autonomous phase runner

Runs one phase of a numbered implementation plan task-by-task, checkpointing
after every task. Two failure modes cost the most time in this repo and this
skill exists to prevent both: **an interrupted session losing a whole phase's
context**, and **a gate believed green that was never actually proven green**.

CLAUDE.md's rules apply in full (git read-only, Biome/TAB, Reuse-First, never
weaken a gate, the Unified Puck Contract). Skill-specific mechanics follow.

## 0. Startup: resume or initialize

Do this before reading anything else.

**a. Confirm the authoritative checkout.** `pwd` and
`git rev-parse --show-toplevel` must be `/root/Rhett/anvilkit-studio`. Never
run a phase from `.claude/worktrees/*`. Abort loudly if they differ.

**b. Check for an existing run.** Read `.claude/state/phase-run.json`:

- **File exists and `nextTask` is non-null (or any task is `in_progress`)** →
  this is a RESUME. Do **not** re-read the whole plan, re-derive the task
  list, or re-explore the baseline. Trust the state file: report the last
  completed task, pick up at exactly `nextTask`, and run only a cheap drift
  check (`git rev-parse HEAD` vs `baseline.head`, `git status --porcelain`
  vs `baseline.porcelain`). If HEAD moved or files changed, note the drift in
  the state file's `interference` list and re-hash any target file before
  editing it (§3a) — but still resume, don't restart.
- **File exists for a DIFFERENT plan/phase than requested** → surface it.
  Archive it to `.claude/state/phase-run-<phase>-<MMDD-HHMM>.archived.json`
  only with the user's confirmation; never silently discard incomplete work.
- **No file** → fresh run: continue with §1.

**c. State file protocol.** `.claude/state/phase-run.json` is the single
durable record. Schema:

```json
{
  "version": 1,
  "plan": "docs/plans/<file>.md",
  "phase": "0",
  "mode": "execute | dry-run",
  "startedAt": "<ISO>",
  "updatedAt": "<ISO>",
  "baseline": { "head": "<sha>", "porcelain": ["<lines>"], "dirtyCount": 0 },
  "scopeContract": ["<path allowlist>"],
  "tasks": [
    {
      "phase": "0",
      "taskId": "P0-01",
      "title": "<from the plan>",
      "status": "pending | in_progress | done | done-flaky | dry-run-done | blocked | failed",
      "gatesPassed": { "typecheck": "<evidence or skipped>", "lint": "…", "test": "…" },
      "filesTouched": ["<paths>"],
      "fileHashes": { "<path>": "<sha256 recorded at §3a>" },
      "retryCount": 0,
      "lastError": null,
      "notes": "<discoveries, deferred items>"
    }
  ],
  "nextTask": "P0-03 | null",
  "interference": [],
  "flakes": [],
  "deferred": []
}
```

Write it **after every task, before anything else** — atomically: Write to
`.claude/state/phase-run.json.tmp`, then `mv -f` over the real path, so a
crash mid-write can never destroy earlier checkpoints. A session limit then
costs one task, not the phase. `updatedAt` and `nextTask` change on every
write. When the phase completes, set `nextTask: null` — that is the
"complete" marker resume checks.

## 1. Plan and phase resolution (fresh runs only)

- Read the plan end-to-end. Locate the target phase; if the user didn't name
  one, the "next unexecuted phase" is the lowest phase with no `done` tasks in
  any state/ledger record and no corresponding `docs/reports/phase-<N>-*` file.
- Quote the phase's scope and exit gate back in 3–6 lines.
- Check `docs/tasks/` for an existing decomposition before making one.
- If any task conflicts with the Unified Puck Contract (CLAUDE.md), stop and
  surface it before executing anything — violations are architecture-blocking.

## 2. Task list and scope contract

- Break the phase into its plan-defined tasks (or 3–8 atomic tasks if the plan
  doesn't enumerate them). Each task must be independently verifiable.
- Record in the state file a **scope contract**: the explicit path allowlist
  this phase may edit. Work outside it becomes a `deferred` entry, never a
  silent expansion.
- Print the task list + scope contract, then proceed — this runner is
  autonomous by default; do not wait for per-task approval. Halt only for:
  a gate failure after 3 retries (§3d), file deletion, a new dependency,
  plan ambiguity, or a Puck-contract conflict.

## 3. Task loop

For each task: guard (§3a) → edit (§3b) → gates (§3c, self-heal §3d) →
checkpoint (§3e). Mark `in_progress` in the state file when starting, so a
crash mid-task is visible on resume.

### 3a. Concurrency guard — hash before, re-verify before write

This checkout has concurrent writers (other sessions, an auto-commit hook).
Before applying any edit:

1. `git status --porcelain` — snapshot it. Diff against `baseline.porcelain`;
   record unexpected new entries in `interference`.
2. `sha256sum <each target file>` — record in the task's `fileHashes`.
3. **Immediately before every Write/Edit to a file, re-run `sha256sum` on it.**
   - Hash unchanged → proceed.
   - Hash changed → do NOT write. Re-read the file, re-derive the edit against
     its current content, record the event in `interference`, and only then
     write (re-verifying once more). Never clobber another writer's change.
4. After the write, verify the edit landed (grep for the new content; after
   any `replace_all`, grep the old pattern for zero remaining hits — always
   excluding `node_modules`, `dist`, `.claude/worktrees`).

Submodule caveat: edits inside `packages/extensions/components`,
`packages/extensions/plugins/*`, `packages/capabilities/canvas/*`, and collab
plugins may not show in superproject status — run the porcelain check inside
the submodule working tree too, and list submodule files separately.

### 3b. Execute the edit

- Run the Reuse-First check before any new helper/abstraction/dependency.
  New dependencies halt for user confirmation.
- Respect the active hooks: `dist/` writes blocked (edit source, rebuild),
  Biome autoformats every write, classic-JSX packages need
  `import * as React from "react";`.
- File deletion: never autonomous. Grep inbound references, record the
  deletion list + counts in `notes`, mark the task `blocked`, and stop.

### 3c. Per-task gates (scoped) and phase-boundary gate (full)

**After each task, run only the scoped gates for the affected packages:**

```bash
pnpm --filter <pkg> typecheck && pnpm --filter <pkg> lint && pnpm --filter <pkg> test
```

- Multiple affected packages → repeat `--filter` per package.
- The components tree is a **nested workspace**: run from
  `packages/extensions/components/` for packages under it.
- Rebuild an affected package (`pnpm --filter <pkg> build`) before any gate
  that consumes its `dist` (dependent-package tests, E2E, browser checks).
- **Do NOT run the repo-wide gate per task.** The full gate runs once per
  phase boundary: `pnpm gate:full` (typecheck → lint → madge → test → build →
  publint → check:all). Add `pnpm size` and
  `node scripts/check-submodule-contracts.mjs` for release/submodule work.

**Evidence rule — a gate is green only if it printed a result.** Quote the
numeric summary line (test/file counts, task counts) into `gatesPassed`.
Empty or ambiguous output is a FAILURE. A pipe hides the real exit code —
check `${PIPESTATUS[0]}` or scan for `ELIFECYCLE`. Record before → after test
counts for tasks that claim new tests.

### 3d. Self-healing retry policy

On a gate failure, do not immediately retry blind. Classify first, in order:

1. **Environment rot** — check CLAUDE.md's Environment Hygiene list: stale
   `.next`, orphaned Playwright/port holder, nested-workspace TypeScript
   clobber (`pnpm why typescript`), drifted api-snapshots, concurrent-session
   churn (`git log --oneline -8` for commits you didn't make). Match against
   `.claude/rules/gate-playbook.md`; the `gate-guardian` skill runs this
   classification end-to-end, and the `release-gate-triager` agent settles
   pre-existing-vs-regression calls.
2. **Apply the matched remedy**, re-run only the failed gate, increment
   `retryCount`, record the classification in `lastError`.
3. **Code regression from this task's edit** → fix within scope, re-run.
4. **Pre-existing failure** (red on clean baseline) → record it in `notes`
   and `deferred`, do not fix out of scope, do not count it against the task.

Cap: `retryCount` ≤ 3 per task. On the 4th failure, set `status: "blocked"`,
`lastError` to the final classified error, write the checkpoint, write a
diagnostic report `docs/reports/phase-<N>-diagnostic-<taskId>-<MMDD-HHMM>.md`
(command, full failing output tail, classifications tried, remedies applied,
state snapshot), and stop the phase. Never weaken a test/gate/budget to pass.

### 3e. Checkpoint after EVERY task

Update the state file (atomic write per §0c) the moment a task reaches a
terminal status — before reporting, before starting the next task. Also print
the one-line task report:

```
<taskId>: <title> — <status>. Gates: <evidence>. Files: <n>. Retries: <n>.
```

## 4. E2E protocol — cleanup first, explicit server, never let Playwright boot

E2E on this box is the largest source of wasted cycles. Before ANY E2E run:

**1. Cleanup (always, even if things "look" clean):**

```bash
pkill -f '[p]laywright' 2>/dev/null; sleep 1
PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | head -1)
[ -n "$PID" ] && kill "$PID" && sleep 2
```

WSL2 caveats: a port can be blocked by a **Windows port reservation even with
an empty `ss` listing** — if binding fails, pick a fresh port rather than
fighting it. If any workspace `dist` was rebuilt this session, also
`rm -rf apps/<app>/.next` (a running dev server keeps old modules resident —
never delete `.next` while a server is still running; kill first).

**2. Start the server explicitly — Playwright must NEVER spawn it:**

```bash
(cd apps/<app> && PORT=$PORT pnpm dev > "$CLAUDE_JOB_DIR/tmp/<app>-dev.log" 2>&1 &)
```

**3. Health-check the port before starting Playwright:**

```bash
for i in $(seq 1 60); do
  curl --noproxy '*' -sf -o /dev/null "http://localhost:$PORT" && break
  sleep 5
done
```

`--noproxy '*'` is mandatory (the proxy intercepts localhost). The studio
webServer boot is ~2.5 min of silence — that is NORMAL; allow ≥5 min before
calling it hung. If the health check never passes, that is an environment
failure (§3d) — do not start Playwright.

**4. Run Playwright against the running server** (`reuseExistingServer: true`
attaches to it; if a config lacks that, override it — never let the config
boot its own). Use `--workers=1` and unique room IDs for collab specs. Run a
known-green baseline spec first; if it fails identically to the new spec, the
cause is environmental — say so instead of debugging the new spec.

**5. Postflight:** assert a **non-zero passed count** from the reporter.
Empty output or `0 passed` is a FAILURE, never green.

## 5. Flaky-test policy

When a spec fails (unit or E2E):

1. **Re-run only that spec**, not the suite:
   `pnpm --filter <pkg> exec vitest run <path>` or
   `pnpm --filter <app> exec playwright test <spec> --workers=1`.
   Up to **3 total attempts** for that spec.
2. **Capture a failure signature** per attempt: strip ANSI
   (`sed 's/\x1b\[[0-9;]*m//g'`), take the first assertion/Error line, drop
   timestamps, durations, ports, and hex addresses.
3. **Passes on retry** → flaky. Append (never rewrite) an entry to
   `docs/flaky-tests.md` — create it with a table header if missing, dedupe
   by spec+signature:

   ```markdown
   | <YYYY-MM-DD> | <spec path> | <failure signature> | fail×<n>→pass | <phase>/<taskId> |
   ```

   Add the spec to the state file's `flakes`, mark the task `done-flaky`,
   and continue the phase.
4. **Fails 3 times with an identical signature** → deterministic failure:
   stop the phase per §3d (diagnostic report + `blocked`).
5. **Fails 3 times with differing signatures** → unstable environment:
   run the §3d environment classification once; if no remedy matches, stop
   the phase and report it as `blocked: env`, not as a code regression.

Known env-not-regression patterns here: sidebar-modules visual baselines
missing on Linux; headless Chromium screenshots hanging (use `xvfb-run` +
`headless: false`); jsdom rendering 0 virtual rows without layout.

## 6. Phase boundary: full gate + deliverables report

When the last task reaches a terminal status:

1. Run `pnpm gate:full` and record the **exact pass/fail counts from that
   run's output** (never carry a count over from a previous run).
2. Re-check drift against `baseline` one final time; list any interference.
3. Write `docs/reports/phase-<N>-deliverables.md`. **Never overwrite** — if
   the file exists, suffix `-run2` (or `-MMDD-HHMM`). Template:

   ```markdown
   # Phase <N> deliverables — <plan title>

   - Run: <startedAt> → <finishedAt> · mode: <execute|dry-run> · baseline: <sha>

   ## Tasks completed
   | Task | Title | Status | Gates (evidence) | Files |

   ## Phase-boundary gate
   <exact command + pass/fail counts + any pre-existing failures>

   ## Tests added
   <package: before → after (+delta)>

   ## Flakes quarantined
   <rows mirrored from docs/flaky-tests.md, or none>

   ## Deferred items
   <out-of-scope findings, blocked follow-ups, pre-existing failures>

   ## Files touched
   <superproject list; submodule files listed separately>
   ```

4. Set `nextTask: null`, write the final checkpoint, and report. Note that
   `docs/reports/` is git-ignored (working docs) — say so when handing over.

## 7. Dry-run mode

`--dry-run` (or "dry-run phase X") validates the phase against reality
without mutating the repo:

- **No source edits, no installs, no servers, no suite runs.** Read-only
  verification only.
- Per task: verify the task's preconditions against the actual tree (the
  files it assumes exist, the versions/APIs it assumes present), enumerate
  the planned edits and their target files, record real `fileHashes` for
  those targets (they double as the §3a baseline for a later execute run),
  set `gatesPassed` values to `"skipped (dry-run)"`, and set
  `status: "dry-run-done"`.
- The checkpoint protocol is UNCHANGED: write the state file after every
  task, exactly as in execute mode — dry-run exists partly to prove the
  resume machinery works.
- A precondition that fails verification marks the task `blocked` with
  `lastError` explaining the mismatch — that is the dry run doing its job.
- At the end, emit the deliverables report with mode `dry-run`, and clear
  `.claude/state/phase-run.json` to `nextTask: null` only if the user wants
  the slot freed; otherwise leave it as the primed baseline for execution.
