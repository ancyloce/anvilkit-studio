# Puck upgrade checklist and version-contract test guidance

PLAN-0025 P6-06. `@puckeditor/core` is the repository's sole editor
contract (CLAUDE.md, Unified Puck Contract), pinned to an **exact
version** at the installers of record (root, `apps/studio`,
`packages/runtime/core`) with `^`-ranged peers everywhere else. This
document is the procedure for changing that pin.

## Standing rules

- **No automated upgrades.** Dependency automation must never auto-merge
  a Puck minor or major (plan §15). Every upgrade lands through a
  dedicated PR that follows this checklist end to end.
- **One version in the tree.** `scripts/check-puck-imports.mjs` (CI)
  asserts the lockfile resolves exactly one `@puckeditor/core` equal to
  the root pin, and that nothing imports `@puckeditor/core/dist/*` or
  internal reducer paths.
- **Public surface only.** The four load-bearing public APIs are
  `Config`/`Data`, `PuckApi` (`setData` functional updater,
  `recordHistory`, `resolveAllData`), `walkTree`/`transformProps(config)`,
  and the composition components. Anything else is an implementation
  detail Puck may change freely.

## The checklist (in order)

1. **Read the release notes** for every version between the pin and the
   target; list every entry touching Data shape, history, `resolveData`,
   overrides, composition, or RSC entries.
2. **Bump the pin** in the three installers of record; run
   `pnpm install`; confirm `check-puck-imports` still reports one
   resolved version.
3. **Run the version-contract suite first** —
   `packages/runtime/core/src/testing/editor/__tests__/puck-public-contract.test.ts`
   (P0-02). It locks the exact API shapes above; a failure here is a
   contract break, not a flake. Update the suite ONLY for documented
   upstream changes, never to paper over behavior drift.
4. **Retest the single Overrides adapter.** The iframe bridge
   (`PuckIframeAppearanceBridge` + `AppearanceIframeOverride`) is the one
   sanctioned override boundary; its contract tests
   (`appearance-iframe-bridge.test.tsx`) are written against the pinned
   version and must be revalidated (or the adapter replaced) on every
   upgrade. Nothing else may depend on override internals.
5. **Run the cross-surface parity suite**
   (`cross-surface-parity.test.tsx`): one document → one fingerprint in
   the editor canvas, `AnvilKitRender`, and the export runner. Parity
   drift after an upgrade means Puck changed rendering semantics —
   investigate before adapting.
6. **Full gates**: `pnpm gate:full`, then the studio editor E2E suites
   (`inspector-tabs`, `visual-editor`, `phase3-surfaces`) against a live
   server, and the exporter certification suites in
   `plugin-export-html` / `plugin-export-react`.
7. **Migration invariants**: `migrateToPuckNativeV2`'s suite exercises
   Puck's own `migrate()` as step 1 — run it and re-check idempotency
   (§14.5) since upstream `migrate()` behavior participates directly.
8. **Land it alone.** The upgrade PR contains the pin bump, any
   documented contract-suite updates, and nothing else.

## When something breaks

Do not fork behavior per surface and do not reach into
`@puckeditor/core/dist/*`. If a public API the contract suite locks has
changed shape, the fix is a deliberate adaptation PR updating the
contract test, the adapter, and every consumer together — with the
plan's §1 condition (editor = preview = production = export) re-proven
by the parity suite before merge.
