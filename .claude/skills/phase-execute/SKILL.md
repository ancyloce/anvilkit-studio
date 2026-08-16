---
name: phase-execute
description: |
  Autonomous phase runner for numbered plans (docs/plans/*, docs/prd/*):
  scoped gates per task, full gate only at phase boundaries, checkpoint to
  .claude/state/phase-run.json after every task so a run resumes at the
  exact next task, edit-guard.mjs against concurrent writers, explicit E2E
  servers, flaky quarantine, deliverables report at phase end. Use for
  "execute phase X of <plan>", "drive the next phase", "phase-execute
  <plan>", "resume the phase", or "dry-run phase X".
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

# Phase Execute

Runs one phase task-by-task with a durable checkpoint after every task.
Prevents this repo's two costliest failures: an interrupted session losing
the phase's context, and a gate believed green that was never proven green.
**All CLAUDE.md rules apply; this file adds only the phase-runner deltas.**

## 0. Startup

`git rev-parse --show-toplevel` must be `/root/Rhett/anvilkit-studio` (never
a `.claude/worktrees/*` copy) — abort loudly otherwise.

Read `.claude/state/phase-run.json`:

- `nextTask` non-null, or any task `in_progress` → **RESUME**: do not
  re-read the plan or re-explore the baseline. Report the last done task,
  continue at exactly `nextTask`. Drift check only: `git rev-parse HEAD` vs
  `baseline.head`, `git status --porcelain` vs `baseline.porcelain`; on
  drift, log to `interference` and `edit-guard verify` before touching
  guarded files. Resume — never restart.
- File is for a different plan/phase → surface it; archive to
  `.claude/state/phase-run-<phase>-<MMDD-HHMM>.archived.json` only with
  user confirmation.
- Missing, or `nextTask: null` → fresh run (§1).

Schema — the single durable record. Write it after EVERY task, atomically
(Write `….json.tmp`, then `mv -f`); `nextTask: null` is the completion
marker:

```json
{
  "version": 1, "plan": "docs/plans/<file>.md", "phase": "0",
  "mode": "execute|dry-run", "startedAt": "<ISO>", "updatedAt": "<ISO>",
  "baseline": { "head": "<sha>", "porcelain": ["<lines>"], "dirtyCount": 0 },
  "scopeContract": ["<path allowlist>"],
  "tasks": [{
    "phase": "0", "taskId": "P0-01", "title": "<from the plan>",
    "status": "pending|in_progress|done|done-flaky|dry-run-done|blocked|failed",
    "gatesPassed": { "typecheck": "<evidence|skipped>", "lint": "…", "test": "…" },
    "filesTouched": [], "retryCount": 0, "lastError": null, "notes": ""
  }],
  "nextTask": "P0-03|null",
  "interference": [], "flakes": [], "deferred": [],
  "phaseBoundaryGate": null, "deliverablesReport": null
}
```

File hashes are NOT stored here — `scripts/edit-guard.mjs` owns them in
`.claude/state/edit-guard.json`, keyed by the same `taskId`.

## 1. Fresh-run resolution

- Read the plan end-to-end. No phase named → the lowest phase with no
  `done` tasks and no `docs/reports/phase-<N>-*` file.
- Quote the phase's scope + exit gate back in 3–6 lines. Check
  `docs/tasks/` for an existing decomposition before making one.
- **Doc register**: newer plans list "DOC-nn must exist before task X"
  prerequisites (delivered to `docs/designs/`). A missing prerequisite doc
  marks its dependent tasks `blocked` — never skip silently.
- Puck-contract conflict in any task → stop and surface before executing.

## 2. Tasks + scope contract

Use the plan's tasks, or split into 3–8 atomic, independently verifiable
ones. Record a path-allowlist `scopeContract`; out-of-scope work becomes a
`deferred` entry, never a silent expansion. Print list + contract, then run
without per-task approval. Halt only for: 4th gate failure, unauthorized
deletion, a new dependency, plan ambiguity, or a Puck-contract conflict.

## 3. Task loop — guard → edit → gates → checkpoint

Mark `in_progress` in state at task start so a crash mid-task is visible.

**Guard (mandatory — the old prose hashing had 0/8 compliance; concurrent
writers here have destroyed stale-content edits twice):**

```bash
node scripts/edit-guard.mjs record <taskId> <file...>  # before reading/thinking
node scripts/edit-guard.mjs verify <taskId>            # before FIRST and EACH later write
```

`verify` exit 1 = drift: do NOT write — re-read, re-derive against current
content, `record` again, log to `interference`. Also porcelain-diff vs
`baseline` at task start (inside submodule working trees too) and log
surprises to `interference`.

**Edit:**

- New dependency → halt for confirmation; pnpm `minimumReleaseAge` (7 days
  in the components workspace) fails too-fresh installs — pin older.
- Deletion is never autonomous, with one carve-out: test/spec/fixture
  deletions the plan authorizes via the deferred-verification ledger
  (`docs/tasks/0026-deferred-verification-ledger.md`) — delete + ledger row
  + `pnpm check:ledger` in the same task. Anything else: record inbound-ref
  counts in `notes`, mark `blocked`, stop.

**Gates — scoped per task; the full gate runs ONLY at the phase boundary
(§4). This cadence intentionally overrides CLAUDE.md's
gate-full-after-multi-file-change default:**

```bash
pnpm --filter <pkg> typecheck && pnpm --filter <pkg> lint && pnpm --filter <pkg> test
```

- Components tree = nested pnpm workspace (also claims
  `packages/runtime/ui`, `packages/capabilities/analytics/*`,
  `packages/tooling/configs/*`): run from `packages/extensions/components/`;
  installs follow `.claude/rules/pnpm-install-order.md` (components BEFORE
  root, else duplicate-React crashes).
- Rebuild affected packages before any gate consuming their `dist`. A bare
  rebuild of `@anvilkit/core` wipes its compiled `styles.css` — use the
  package's own build script.
- Evidence into `gatesPassed`: the quoted numeric summary line. Pipes hide
  exit codes — check `${PIPESTATUS[0]}` or scan for `ELIFECYCLE`. Record
  before → after test counts when a task claims new tests.

**Retry (cap 3 per task).** Classify before retrying, in gate-playbook
vocabulary (`ENVIRONMENT_ROT`/`CODE_REGRESSION`/`PRE_EXISTING`/`UNKNOWN`):

1. Environment rot — CLAUDE.md's Environment Hygiene list, then
   `.claude/rules/gate-playbook.md` signatures/remedies (the `gate-guardian`
   skill runs this end-to-end; `release-gate-triager` settles
   pre-existing-vs-regression). Apply the remedy, re-run only the failed
   gate, `retryCount++`, classification → `lastError`.
2. Regression from this task's edit → fix within scope, re-run.
3. Pre-existing (red on clean baseline, e.g. the 5 stable `@anvilkit/ui`
   base-ui failures) → `notes` + `deferred`; not counted against the task.
4. Unknown → root-cause, then append a new gate-playbook entry.

4th failure: `status: "blocked"`, checkpoint, write
`docs/reports/phase-<N>-diagnostic-<taskId>-<MMDD-HHMM>.md` (command,
failing-output tail, classifications tried, remedies, state snapshot), stop
the phase.

**Checkpoint** atomically the moment a task reaches terminal status —
before anything else. Then print:

```
<taskId>: <title> — <status>. Gates: <evidence>. Files: <n>. Retries: <n>.
```

## 4. Phase boundary

1. `pnpm gate:full`; record exact pass/fail counts from THIS run.
2. **Expect the documented concurrency phantom**: a shifting 11–14-package
   ELIFECYCLE sweep under full-workspace turbo test load — it hit
   essentially every plan-0025/0028 boundary (see `docs/flaky-tests.md`).
   Re-run each failed package's tests isolated, same hour; the isolated
   file/test counts are the evidence → `phaseBoundaryGate`. Green iff every
   failure is isolated-green (phantom) or documented pre-existing; anything
   else → §3 retry protocol.
3. Extra gates when in scope (deliberately omitted from `gate:full`):
   `pnpm size` (release), `pnpm check:submodules` (submodule pointers
   moved), `pnpm check:ledger` (ledgered test deletions).
4. Final drift check vs `baseline`; then write
   `docs/reports/phase-<N>-deliverables.md` (never overwrite — disambiguate
   with plan id / `-MMDD-HHMM`). Sections: run metadata (start/finish, mode,
   baseline sha); task table `| Task | Title | Status | Gates (evidence) |
   Files |`; boundary gate (command, counts, phantom/pre-existing
   classification with isolated evidence); tests added (per package
   before → after); flakes quarantined; deferred items; files touched
   (submodule files listed separately).
5. Fill `phaseBoundaryGate` + `deliverablesReport` in state, set
   `nextTask: null`, final checkpoint, report — noting `docs/reports/` is
   git-ignored working documentation.

## 5. E2E — clean, explicit servers, Playwright never boots them

Ports: studio `:3000` + collab relay `:21234` · playground `:3100`
(`PLAYGROUND_PORT` overrides) · docs `:4321`.

```bash
# 1. cleanup, always
pkill -f '[p]laywright' 2>/dev/null; sleep 1
PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | head -1)
[ -n "$PID" ] && kill "$PID" && sleep 2
```

WSL2: Windows port reservations can block a port even with an empty `ss`
listing — switch ports rather than fight (why the relay is on 21234, not
1234/11234). If any `dist` was rebuilt this session:
`rm -rf apps/<app>/.next` — kill the server first, never while running.

```bash
# 2. explicit servers — studio needs BOTH
(cd apps/studio && ANVILKIT_PAGE_STORAGE=memory PORT=3000 pnpm dev \
  > "$CLAUDE_JOB_DIR/tmp/studio-dev.log" 2>&1 &)
(node packages/extensions/plugins/plugin-collab-yjs/examples/y-websocket-server.mjs 21234 \
  > "$CLAUDE_JOB_DIR/tmp/collab-relay.log" 2>&1 &)
# 3. health-check before Playwright
for i in $(seq 60); do curl --noproxy '*' -sf -o /dev/null "http://localhost:$PORT" && break; sleep 5; done
```

`ANVILKIT_PAGE_STORAGE=memory` is load-bearing — the sqlite default's commit
latency turns the undo/history-debounce race (§6) into hard failures.
`--noproxy '*'` is mandatory. Studio boots ~2.5 min silent (normal; allow
≥5 min). Health check never passes → environment failure, no Playwright.

Run against the running servers (`reuseExistingServer` attaches — override
any config lacking it), `--workers=1`, unique room IDs for collab. Leave
env-gated projects OFF locally: `ANVILKIT_E2E_VISUAL=1` (baselines are
CI-generated; WSL2 headless screenshots verifiably broken) and
`ANVILKIT_E2E_MATRIX=1` (browser deps CI-provisioned). Run a known-green
baseline spec first — an identical failure means environmental, not the new
spec. Postflight: a non-zero passed count, or it is a FAILURE.

## 6. Flaky policy (any spec failure)

1. Re-run only that spec (`pnpm --filter <pkg> exec vitest run <path>` /
   `pnpm --filter <app> exec playwright test <spec> --workers=1`), ≤3 total
   attempts.
2. Signature per attempt: strip ANSI (`sed 's/\x1b\[[0-9;]*m//g'`), first
   assertion/Error line, drop timestamps/durations/ports/addresses.
3. Pass on retry → flaky: append (never rewrite) to `docs/flaky-tests.md`,
   header `| Date | Spec / package | Failure signature | Evidence | Run |`
   (UPDATE rows over edits; package-level rows legitimate). Add to state
   `flakes`, mark `done-flaky`, continue.
4. 3 identical failures → deterministic: stop per §3's 4th-failure protocol.
5. 3 differing signatures → unstable environment: classify once; no match →
   stop as `blocked: env`, not a regression.

Known env-not-regression patterns (all logged in `docs/flaky-tests.md`):
the full-gate ELIFECYCLE phantom (§4); studio `visual-editor.spec.ts`
inline-undo racing Puck's ~300 ms history debounce (quarantined; possibly a
real UX bug — no ad-hoc fixes); wall-clock perf budgets under machine load;
sidebar-modules visual baselines missing on Linux; headless Chromium
screenshot hangs (`xvfb-run` + `headless: false`); jsdom rendering 0
virtual rows without layout.

## 7. Dry-run

Read-only validation — no edits, installs, servers, or suite runs. Per
task: verify preconditions against the actual tree (files/APIs assumed, §1
doc register), enumerate planned edits, `edit-guard record <taskId>
<targets>` (real hashes prime §3 for a later execute), `gatesPassed:
"skipped (dry-run)"`, `status: "dry-run-done"`. Checkpoint protocol
UNCHANGED — dry-run partly exists to prove the resume machinery. A failed
precondition → `blocked` with the mismatch in `lastError`. Emit the
deliverables report with mode `dry-run`; leave the state file as the primed
baseline unless the user wants the slot freed (`nextTask: null`).
