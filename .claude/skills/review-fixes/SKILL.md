---
name: review-fixes
description: Close out an EXISTING code-review findings report — one subagent per finding, each with a regression test — then regenerate EN/zh/ja/ko docs, run all gates, and verify no stale or unexported symbols remain. Trigger on "/review-fixes", "fix all N review findings", "close the review findings", or when the user hands over a findings report to remediate. Distinct from review-remediate, which produces the review itself first — this skill starts from a report that already exists.
version: "1.0.0"
---

# Review Fixes — fan out, fix, verify

Remediate every finding in an existing review report via dedicated subagents, then prove the monorepo is clean. Run end-to-end without stopping to ask how to proceed.

## 1. Read the findings report

- Use the report path given as the argument; otherwise take the newest file in `docs/code-review/` (git-ignored working space).
- Validate it is non-empty and parseable into discrete findings. If it is missing, empty, or has zero actionable findings, stop and report the gap — do not invent findings.
- Number every finding (`P0-1`, `P1-2`, … or reuse the report's own ids) and create one task per finding (`TaskCreate`).

## 2. One subagent per finding

- Spawn a dedicated subagent per finding (parallel is fine for **editing**). Each subagent must:
  - Fix the root cause, not a band-aid, following repo conventions (Reuse-First, `@anvilkit/ui` primitives, Biome tabs, no new deps without approval).
  - Add a regression test that fails before the fix and passes after. Test-writing gotcha: the react-library vitest preset has `globals: false`, so multi-render `.tsx` tests need an explicit `afterEach(cleanup)`.
  - Run only its own package's `typecheck` + `test` — **never** a workspace-wide or parallel build (rslib buildCache SIGABRT and collab submodule races make concurrent builds unreliable; the coordinator builds later, serially via Turbo).
  - Return: files touched (flagging which are inside submodules), test added, and every symbol it renamed, removed, or newly exported.
- **Verify each subagent actually finished.** A subagent that dies mid-run (session limit) leaves stale type references behind. If a report is missing, truncated, or its claimed edits are absent from disk, re-dispatch that finding — do not assume it landed.

## 3. Regenerate docs and i18n

- If any fix changed a component/plugin public API, run the docs generation for `apps/docs/content/docs/{components,api,templates}` (generated content is committed).
- Regenerate zh/ja/ko bodies via the central translation store at `apps/docs/i18n/readmes/` and run `check:i18n`. The `api` reference is EN-only by design — do not translate it.
- Escape YAML frontmatter values starting with `@` and JSX-like strings in MDX tables, then confirm `pnpm docs:build` parses.

## 4. Run all gates (coordinator, serial)

- Full gate for every touched package: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; add `pnpm madge` and `pnpm publint` for package-level work.
- Rebuild any package that ships from `dist/` before declaring a runtime-facing fix done. Note: a bare `rslib build` of core wipes `styles.css` — use the full `pnpm build`.
- Separate pre-existing failures (verify against clean `HEAD`, report them) from regressions you introduced (fix them). Never weaken a gate to get green.

## 5. Stale / unexported symbol sweep

- Collect the union of symbols the subagents renamed, removed, or added, then:
  - `rg` the workspace (excluding `node_modules`) for the OLD names — zero hits allowed outside changelogs/reports.
  - Confirm every newly referenced symbol is actually exported from its package entry (`rg` the package's public entrypoints; workspace `pnpm typecheck` must be green).
  - If fixes touched path aliases, grep the built `dist/*.d.ts` for leftover `@/` specifiers (rslib rewrites aliases in `.js` but not `.d.ts`).

## 6. Report

- Summarize per finding id: fix, regression test, gate results; list docs/i18n regenerated; state the stale-symbol sweep result; document pre-existing failures separately.
- Leave everything unstaged and flag which modified files live inside submodules. Never commit — this repo is user-committed only.
