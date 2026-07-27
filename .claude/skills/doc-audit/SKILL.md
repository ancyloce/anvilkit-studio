---
name: doc-audit
description: |
  Cross-check a PRD/design doc against the real codebase and emit a review
  report. Enumerates every factual claim the doc makes about the code, verifies
  each one against actual files with file:line citations, and writes a verdict
  table to docs/reviews/. Read-only with respect to source: it audits, it does
  not fix.
  Use when asked to "audit <doc>", "check <PRD> against the code", "verify the
  claims in <plan>", or "doc-audit <path>".
triggers:
  - doc audit
  - audit the PRD
  - check the doc against the code
  - verify the claims in
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
  - Agent
---

# Doc Audit

Given `$ARGUMENTS` (a doc path):

1. Read the doc fully. Enumerate every factual claim about the codebase.
2. Verify each claim with Read/Grep against actual files. Cite `file:line` for each.
3. Do NOT edit source code. Do NOT commit or push.
4. Write the report to `docs/reviews/` using the next free zero-padded index
   (`ls` the dir first to avoid collisions).
5. Report a table: claim | verdict (confirmed/wrong/unverifiable) | evidence path.
