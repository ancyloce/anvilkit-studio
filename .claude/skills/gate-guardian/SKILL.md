---
name: gate-guardian
description: |
  Run the full pre-push gate, then classify every failure as ENVIRONMENT_ROT,
  CODE_REGRESSION, PRE_EXISTING, or UNKNOWN by matching against
  .claude/rules/gate-playbook.md. Auto-applies the playbook remedy for
  environment rot and re-runs only the affected task; bisects and reports code
  regressions without reverting; root-causes unknowns from scratch and appends a
  new playbook entry so the fix becomes permanent knowledge.
  Use when the gate is red, before a release, when CI fails but local passes (or
  vice versa), or when the user asks to "keep the repo green", "run the
  guardian", or "triage the gate".
---

# Gate Guardian

Keeps the repo green and **learns from every failure**. The playbook
(`.claude/rules/gate-playbook.md`) is the memory; this skill is the loop.

Read the playbook first, every run. It is the classifier's only ruleset.

---

## Hard rules — violating any of these is a failed run

1. **Never delete `.next` or any `dist/` while a dev server or watcher is live.**
   Check first, every time:
   ```sh
   ss -tlnp | grep -E ':(3000|3100|4000)' || echo "no dev server"
   ps -eo pid,etimes,args --no-headers | grep -E "next dev|rslib.*watch|vitest --watch" | grep -v grep
   ```
   If anything is alive, stop and report. Deleting a cache under a running server
   produces a *worse*, more confusing failure than the one being fixed.
2. **Never regenerate a lockfile without diffing it.**
   `pnpm install --lockfile-only && git diff pnpm-lock.yaml` — review before
   accepting. Never `rm pnpm-lock.yaml`.
3. **Never run workspace-wide codegen when the task is package-scoped.**
   `apps/docs` `generate:api` has no per-package scope and sweeps the whole
   workspace. If a tool produces out-of-scope diffs anyway, revert them and say so.
4. **Never auto-revert the user's work.** `CODE_REGRESSION` is reported, never
   "fixed" by discarding changes. Bisecting is read-only.
5. **Never commit or push.** Hook-enforced; leave everything in the working tree.
6. **Never claim a stage passed without executing it.** Empty or ambiguous output
   is a failure, not a pass — re-run and read the summary line.
7. **Never write a playbook remedy you have not actually run.**

---

## Step 1 — Baseline the environment (before touching anything)

Cheap, and it prevents the most common misdiagnosis. Record and report all five:

```sh
git status --porcelain          # dirty tree? concurrent-session churn? (GP-012)
git log --oneline -5            # foreign commits during this session?
git submodule status            # gitlink drift? (GP-009)
pnpm why typescript             # install-order clobber? (GP-005/GP-006)
ss -tlnp | grep -E ':(3000|3100)' || echo "no dev server"   # safe to clear caches?
```

Snapshot `git log --oneline -1` now and re-check it at the end. If it changed,
another session committed mid-run — re-baseline before believing any result.

## Step 2 — Run the gate, capture per-task output

```sh
pnpm gate:full > /tmp/gate-guardian.log 2>&1; echo "EXIT=$?" >> /tmp/gate-guardian.log
```

**Never pipe the gate through `tail`/`head`/`grep`** — the pipeline's exit code
replaces pnpm's and a red run reports green. Redirect to a file, then read it.

Extract the per-task verdict:

```sh
tr -d '\000' < /tmp/gate-guardian.log | grep -aE "Tasks:.*(successful|total)|Failed:|EXIT="
```

If `gate:full` is too slow for the situation, `pnpm gate:quick`
(`typecheck → lint → test`) is the fast path; say which one you ran.

## Step 3 — Classify every failure

For each failing task, in this order:

1. **Cascade check.** Per GP-006, some failures cascade — only the first is real
   and the rest are SIGINT noise. Identify the first genuine failure before
   triaging the tail.
2. **Match the playbook.** Test the task's error output against each entry's
   signature regex. First match wins; record the entry ID.
3. **Check `PRE_EXISTING`** (GP-013) — if it is on that list, confirm it still
   reproduces, then stop. Not yours.
4. **No match → `UNKNOWN`.** Go to Step 6.

Distinguishing `ENVIRONMENT_ROT` from `CODE_REGRESSION` when nothing matches:

| Ask | Environment rot | Code regression |
| --- | --- | --- |
| Do the failing files appear in `git status`? | no | usually yes |
| Does the package pass **in isolation**? | yes (GP-010) | no |
| Is the failure timing-shaped (~5 s, exit 134, EADDRINUSE)? | yes | no |
| Does it reproduce on a clean, stashless tree? | yes | no |

The isolation re-run is the single highest-value probe — run it before theorising.

## Step 4 — ENVIRONMENT_ROT → auto-remedy, then re-run only that task

Apply the entry's remedy verbatim, honouring the hard rules (especially the
live-process check before any cache deletion). Then re-run **only** the affected
task, not the whole gate:

```sh
pnpm --filter <pkg> <task>
```

If it goes green, record `remedied`. If the same remedy fails **twice**, stop
auto-applying and escalate to `UNKNOWN` — a remedy that does not work means the
signature matched the wrong cause.

## Step 5 — CODE_REGRESSION → bisect, report, do not fix

Read-only. Identify the smallest change that introduces it:

```sh
git log --oneline -20 -- <failing path>
git diff HEAD -- <failing path>
```

If the working tree is dirty, the suspect is almost certainly uncommitted work —
name the file and the hunk. Only use `git bisect` when the regression is already
committed and the range is non-trivial; never bisect across a dirty tree.

Report: the failing task, the offending change, the evidence, and a proposed fix.
Then stop. The user decides.

## Step 6 — UNKNOWN → root-cause, then teach the playbook

1. Reproduce in isolation (`pnpm --filter <pkg> <task>`). Does it still fail?
2. Front-load environment triage — work `## Environment Hygiene` in `CLAUDE.md`
   before reading application code. In this repo the root cause is environmental
   more often than not.
3. Form one hypothesis, test it, discard it if wrong. Do not stack theories.
4. Once solved and the remedy is **actually run and verified**, append a new entry
   to `.claude/rules/gate-playbook.md` using the template at the bottom of that
   file: next free `GP-0NN`, class, confidence, regex-matchable signature, root
   cause, remedy commands, verification command, date, observed instance.

An `UNKNOWN` that is solved but not written down is a failed run — the next
session pays for it again.

## Step 7 — Report

Emit one table, most severe first:

| Task | Verdict | Playbook | Action taken | Now |
| --- | --- | --- | --- | --- |
| `pkg#task` | ENVIRONMENT_ROT | GP-001 | cleared `.next`, re-ran | green |

Then state, explicitly:

- The exact gate command run and its **real** exit code.
- The pass/fail count **from this run's output** — never carried over from a
  previous run. Turbo's totals vary with which packages changed.
- Every playbook entry added or amended.
- Anything left red, and why it was not fixed.
- Any file touched outside the requested scope.

If nothing was red: say the gate is green, give the counts, and stop. Do not
invent work.
