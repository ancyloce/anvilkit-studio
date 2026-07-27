# Visual Editor — Rollout Stages and Rollback Drill

**Task:** PLAN-0020 CORE-P4-005 · **Requirements:** DD-0019 §26, §30.7;
plan Section 15 · **Date:** 2026-07-27

The executable half of this document is
`packages/runtime/core/src/testing/editor/__tests__/compatibility-matrix.test.ts`
(25 tests: one per §26.1 row, plus the stage gates and migration rules).
This file is the narrative an operator follows.

---

## 1. The one invariant

**Rollback disables writers. It never removes the reader, and it never
deletes sidecar data.**

Everything below follows from that. A host that rolls back by deleting
`root.props.__anvilkit` has not rolled back — it has destroyed authored
work, and no forward migration can recover it.

## 2. Stage gates (§30.7)

| Stage | Writer state | Exit gate | How to verify |
|---|---|---|---|
| Reader only | off | all legacy fixtures load unchanged | `vitest run src/testing/editor/__tests__/compatibility-matrix.test.ts` — the "Reader-only stage" block |
| Dev preview | development only | metadata, inspector, geometry contracts pass | core suite green + `pnpm --filter @anvilkit/core check:all` |
| Internal alpha | 10% | Phase 1 E2E, no corruption, export gate | `apps/studio` editor E2E suite |
| Opt-in beta | 25% | two stable weeks and p95 budgets | `pnpm --filter @anvilkit/core bench:editor` against the stored baseline |
| GA | policy-controlled | compatibility, accessibility, security, exporter sign-off | this document + `docs/security/0020-core-visual-editor-security-review.md` + the §27.6 a11y sweep |

## 3. How a host rolls back

Set `StudioProps.editor.features.enabled` to `false` (or drop the
`editor` prop entirely).

What happens:

1. **No editor module is imported.** `StudioEditorMount` returns before
   the dynamic `import()`, so the lazy editor chunk is never requested.
2. **`decoratePuckConfig` returns the host's config by identity** — not a
   copy — so Puck's app store is not reset and component render identity
   is unchanged.
3. **The sidecar stays on the document.** Core does not rewrite
   `root.props`, so `__anvilkit` survives verbatim, revision included.
4. **Re-enabling picks up exactly where it left off.** The reader parses
   the same bytes; authored names, layout, and overrides are intact.

Steps 3 and 4 are asserted by the "rollback drill" block in the
compatibility matrix suite: the canonical serialization of the sidecar
before and after a rollback cycle is compared byte-for-byte.

## 4. Feature flags hide UI; they never delete data

Turning off an individual capability (`features.layout`,
`features.tokens`, …) hides its authoring UI. Resolvers keep reading
records for that feature, so:

- an author who turned a flag off does not lose the values they wrote;
- an exporter still sees the used-feature set, so preflight still blocks
  an unsupported production export.

A flag that stripped its records would be a destructive migration wearing
a toggle's clothing. The matrix suite asserts a disabled feature's
records survive a read.

## 5. Migrations (§26.3)

- v1 is the current version; **no migration step is registered yet**. The
  framework exists so the first real migration lands as data, not as new
  plumbing.
- Migrations are pure and idempotent — running twice equals running once,
  asserted on canonical bytes.
- An unknown *minor*/unknown field is preserved verbatim (forward
  compatibility, and hostile-peer safety in collab).
- An unknown **major** never reaches the registry: readers classify it
  read-only upstream via `detectAuthoringVersion`, and the raw sidecar is
  preserved untouched. A reader that "repaired" what it could not parse
  would silently delete an author's work on load.
- The registry refuses a version it has no step for rather than guessing.

## 6. Compatibility matrix status (§26.1)

All nine rows are asserted. Two are worth calling out because their
guarantee is structural rather than behavioural:

- **Row 5 (PageIR v1 preserved)** holds because the sidecar rides on
  `root.props` and never enters `content` — so a legacy IR conversion is
  byte-identical whether or not authoring data exists.
- **Row 8 (CSS scope)** holds because authoring CSS is written only into
  the iframe document handed to `applyAuthoringStylesheet`, and every
  rule is scoped under a `[data-ak-node]` selector. The suite asserts the
  parent document's `<style>` count is unchanged.

## 7. Known limitation

The reader-only stage is verified against **synthetic** legacy corpora
(`buildLegacyPuckData` at 0/1/3/25 nodes) plus the repo's own demo
document. A host with a large production corpus should run the same
assertions against its own documents before advancing past Dev preview —
the shapes Core generates cannot prove anything about props Core has
never seen.
