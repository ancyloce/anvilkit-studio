---
name: adversarial-review
description: Adversarial code review of a target package. Explore the package, run the real gates (typecheck, lint, build, tests), triage and refute optimistic claims, then save a prioritized findings table to a report file rather than dumping it inline. Use when asked to review, audit, or adversarially check a package's quality. Invoke with /adversarial-review (renamed from /review to avoid colliding with gstack's pre-landing PR review).
---

# Adversarial Code Review

A skeptical, evidence-first review pass. Every claim must be grounded in real
command output — no findings asserted from reading alone, no "looks fine"
without running the gate.

## Procedure

1. **Explore the target package.** Map its entry points, public surface, tests,
   and config. Identify what the package promises and where it could break.

2. **Run the gates and record real output.** Execute `pnpm typecheck`,
   `pnpm lint`, `pnpm build`, and `pnpm test` (scoped to the package). Capture
   actual stdout/stderr — exit codes, error lines, counts. Never paraphrase a
   gate you did not run.

3. **Triage findings; refute optimistic claims.** For each candidate finding,
   try to disprove it against source and gate output before accepting it.
   Separate real regressions from pre-existing/infra noise (see the repo's
   known-issue memories). Drop anything you cannot reproduce.

4. **Save a prioritized findings table to a report file.** Write the results to
   a report file (e.g. `docs/reviews/<package>-review.md` or
   `$CLAUDE_JOB_DIR/tmp/<package>-review.md`) — a P0/P1/P2 table with
   file:line, evidence, and proposed fix. Do **not** dump the full table inline;
   summarize and point to the file.

## Notes

- Tabs, not spaces; Biome over Prettier (see Formatting & Conventions).
- Treat unverified claims as refuted by default.
- Keep the inline reply concise; the report file holds the detail.
