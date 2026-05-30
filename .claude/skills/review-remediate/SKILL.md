---
name: review-remediate
description: Use for the review-then-fix-everything loop on a package or diff — deliver a grounded review report immediately (no scoping questions, no plan-approval), then remediate every finding as tracked numbered items, gating each batch on typecheck/lint/test/build plus an independent Codex pass until clean. Trigger on "review and fix <package>", "remediate the review", "review-fix-verify", or when the user wants a deep review followed by autonomous remediation. Distinct from gstack `review` (pre-landing PR review) and `code-review` (diff only) — this reviews from scratch AND fixes to green.
version: "1.0.0"
---

# Review → Remediate → Verify

The user's highest-value loop, codified. Run it end-to-end without stopping to ask how to proceed.

## 1. Review (deliver immediately)

- Produce the review report as your FIRST action — no scoping questions, no `ExitPlanMode`. State scope assumptions inline.
- Read the target package/diff in full; ground every finding in `file:line` evidence.
- Classify by severity and number each finding so it is trackable: **P0** (correctness / security / release-blocker), **P1** (should-fix), **P2** (nice-to-have) → `P0-1`, `P1-2`, …
- Write the report to `docs/code-review/<target>-review-<UTC-timestamp>.md` (the `docs/` tree is git-ignored working space).

## 2. Track

- Create one task per P0/P1 finding (`TaskCreate`); flip to `in_progress` / `completed` as you go.

## 3. Remediate (batched, priority order)

- Fix P0 first, then P1. Prefer a root-cause fix plus a regression test over a band-aid.
- After editing source that ships from `dist/`, rebuild the affected bundle before continuing — source-only edits do not reach consumers.

## 4. Gate each batch

- Run the full gate for touched packages: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (or the package's `check:all`).
- Separate pre-existing / unrelated failures (report them) from regressions you introduced (fix them). The repo has several documented pre-existing flakes — verify against clean `HEAD` before blaming your change.

## 5. Independent verify (Codex)

- Run an independent Codex pass over the changes (`/codex:review`, or a scoped read-only `codex exec` — avoid `--uncommitted`, which times out here).
- Fix everything it legitimately flags; re-run the gate. Iterate until Codex is clean AND all gates pass with zero new test failures.
- If Codex is unavailable (usage limit / timeout), say so explicitly and lean on the gates.

## 6. Report

- Summarize: findings closed (by id), gate results, Codex verdict, and any pre-existing failures documented separately. Stop only when every gate is green.

Leave commits to the user — this repo: never commit.
