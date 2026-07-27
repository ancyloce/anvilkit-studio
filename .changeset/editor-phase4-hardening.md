---
"@anvilkit/contracts": minor
"@anvilkit/core": minor
"@anvilkit/ui": patch
---

Visual editor Phase 4 — hardening, compatibility, performance, and release
readiness (PLAN-0020 CORE-P4-001…008).

**Performance (§28).** New `pnpm --filter @anvilkit/core bench:editor` harness
runs seven engine-level §28 metrics over fixed 1k/10k fixtures (20-run median
and p95) and fails on an absolute-budget violation or a >10% regression against
a stored, hardware-class-keyed baseline. New CI job runs it on its own runner.
`@anvilkit/core/testing/editor` now exports the fixed perf profiles
(`buildPerfProfile`, `PERF_PROFILE_PRESETS`) and the gate itself
(`compareBenchRun`, `summarizeSamples`, `formatBenchRun`) so hosts can benchmark
their own integration against the same inputs.

**Development performance overlay (§28).** Dev-only, lazily loaded, and
double-gated on a non-production `NODE_ENV` plus an explicit opt-in
(`?akPerf=1` or `window.__ANVILKIT_EDITOR_PERF__`). Reports node and registry
counts, command duration, resolver cache hit rate, observer batch size, iframe
document generations, and tasks over 50 ms. `check:bundle-budget` now asserts it
is absent from both the `<Studio>` entry chunk and the chrome chunk.

**Accessibility (§27.6).** Fixes six real findings, five of them axe
Critical/Serious:

- `aria-selected` removed from the role-less motion-highlight wrapper (invalid
  ARIA; the wrapped `role="tab"` element already owns the state) — fixed in both
  `@anvilkit/core`'s vendored copy and `@anvilkit/ui`;
- array fields no longer declare `role="list"` while empty, and the "add item"
  button moved out of the list (a `list` may only own `listitem` children);
- inspector select triggers gained accessible names (`aria-label`), which they
  lacked entirely whenever their value was unset;
- the canvas iframe is now titled, so screen readers do not announce the page
  canvas as an unnamed frame;
- the canvas workspace scroll container is keyboard-focusable and named;
- accessibility issue severity is stated in **text**, not only by icon colour.

The Layers panel now exposes proper `tree` / `treeitem` roles with
`aria-level`, `aria-expanded`, and `aria-selected`. **Behaviour change for
tests:** selection is announced on the treeitem row (`ak-layer-node-<id>`), not
on the layer name button — `aria-selected` is invalid on a `button`.

**Security and CSP (§29).** New additive `StudioEditorConfig.styleAdapter` lets
a strict-CSP host supply either a `nonce` for the authoring `<style>` element or
an `adopt(doc, cssText)` callback for constructable stylesheets (in which case
Core creates no element at all). `check:no-dynamic-eval` now also rejects
`postMessage(…, "*")` and `document.write`, per §29's prohibited list.
`runExport` gained an `onValidation` sink so the content-free
`export.validation` event is actually emitted — it was previously built and
dropped.

**Accessibility export policy (ED-A11Y-003).** `useExportPreflight` and
`toPreflightA11yIssues` are now exported, and the preflight defaults its
accessibility input to the editor's own live issue set. Previously
`EditorPolicies.exportBlockingSeverity` could never fire: the hook was
unexported and the two issue types differed by one field name. Default remains
non-blocking per OQ-008.

**Component-author tooling (§26.2).** New `inspectEditorCapabilities(config)`
and `formatEditorCapabilityReport()` report each component's adoption level
(0–4) and exactly what to add to reach the next one. React-free, so it runs in a
unit test or a plain Node script.

**Compatibility (§26.1).** The full nine-row compatibility matrix, the §30.7
reader-only stage, the rollback drill, and the migration idempotency rules are
now asserted as an executable suite.
