# Security and Privacy Review — Core Visual Editor (DD-0019 §29)

**Task:** PLAN-0020 CORE-P4-004 · **Date:** 2026-07-27 · **Scope:**
`@anvilkit/core` editor surfaces (`src/editor/**`, `src/react/editor/**`)
plus the export path they feed.

Verdict: **§29 table verified.** Two gaps were found and fixed during the
review (§4). Everything else was already upheld, and where it is upheld by
a *gate* rather than by inspection that is called out — an invariant a
person checked once is weaker than one CI checks every push.

---

## 1. Boundary table (§29)

| Boundary | Untrusted input | Control | Verified by |
|---|---|---|---|
| Puck data → editor | sidecar, props, URLs | versioned Zod schemas; unknown major ⇒ read-only; unknown fields preserved | `schema/editor` suites + `testing/editor` compatibility suite |
| host adapter → preview | schema and preview data | abort, 5 s timeout, size cap, JSON only | `editor/bindings/preview-data.ts` + its tests |
| plugin/AI → commands | typed proposals | capability, revision, and confirmation gates | `editor/ai/proposal.ts`; `assessProposal` refusals are Symbol-branded (Phase 3 defect #1) |
| paste → rich text | HTML and text | Tiptap allowlist sanitation | `react/editor/inline/` paste suites |
| editor → CSS | values and tokens | typed values only through `resolveAuthoringStyle`; allowlisted serializer; never raw CSS text, never `!important` | `editor/style/css-serializer.ts`; §9.3 rejection list covered |
| interaction → browser | URL and targets | protocol allowlist, re-validated **at fire time** | `editor/interactions/validate.ts` + `runtime.ts` |
| exporter → output | feature contract | capability validation; blocked before production export | `export/run-export.ts` + preflight matrix |

## 2. Prohibited behaviors (§29)

| Prohibited | Status | How it is held |
|---|---|---|
| `eval` | absent | `check:no-dynamic-eval` gate, scans `src` **and** `dist` |
| `new Function` / `Function("…")` | absent | same gate (both call forms) |
| arbitrary script injection | absent | gate now also rejects `document.write` / `document.writeln` |
| arbitrary style injection | controlled | one channel only (`applyAuthoringStylesheet`); §3 below |
| prototype access from expressions | structurally impossible | `SafeExpression` has no call node and refuses `__proto__` / `constructor` / `prototype` keys |
| raw-store access by plugins | absent | plugins receive `StudioPluginEditorApi` (read-only selection projection), never the store |
| credential storage in Core | absent | `localStorage` use is limited to UI preference stores (`editor-ui`, `theme`, `ai` prompt history); no token or credential path exists |
| unvalidated `postMessage("*")` | absent | gate pattern added in this task; probe-verified to fire |
| production output of editor-only diagnostics / AI proposal data | absent | the dev perf overlay is double-gated and asserted out of the entry and chrome chunks by `check:bundle-budget`; proposals are sanitized to counts and node ids by `sanitizeProposalForDisplay` |

`check-no-dynamic-eval.mjs` keeps its original filename (renaming would
churn `check:all`, CI, and the pre-push hook) but now covers the §29
primitive list, not only §19's. All four patterns were probe-verified by
introducing a deliberate offender and confirming the gate fails.

## 3. Strict-CSP hosts

§29: *"Core does not require `unsafe-eval`. Hosts with strict CSP may
provide a nonce or constructable-stylesheet adapter for authoring styles;
this path requires integration tests."*

- **No `unsafe-eval` requirement** — established by the gate above.
- **`style-src`** — every authoring style reaches the canvas through
  `applyAuthoringStylesheet`, which is now adapter-aware via the additive
  contract `StudioEditorConfig.styleAdapter`:
  - `nonce` — stamped on the created `<style>` element as both the
    `nonce` property (what the browser checks) and the attribute (what a
    human inspects);
  - `adopt(doc, cssText)` — full takeover, for hosts that forbid inline
    `<style>` outright. Core then creates **no element at all**; that is
    the load-bearing assertion, since also creating one "just in case"
    would trigger the very violation the adapter exists to avoid.
  - The two are alternatives, not layers: `adopt` wins when both are set.
- Integration tests: `src/react/editor/__tests__/csp-style-adapter.test.ts`
  (9 tests, driven against a real jsdom document).

**Known limitation, not fixed here:** two *other* `<style>` injections
exist outside the authoring channel — the iframe theme sheet
(`react/overrides/canvas/CanvasIframe.tsx`) and
`studio/theme/use-theme-sync.ts`. They predate the editor and are outside
§29's "authoring styles" wording, so a strict-CSP host still needs a
`style-src` allowance for them. Extending `styleAdapter` to cover both is
the natural follow-up.

## 4. Findings

**F-1 — `export.validation` was built but never emitted (fixed).**
`runExportPreflight` populated a content-free `event` payload that no code
path delivered anywhere, so §32.1's "events pass privacy review" held only
vacuously and CORE-P3-009's `Val` line ("event emission") was unmet.
`runExport` now takes an `onValidation` sink and fires it exactly once per
attempt — deliberately **before** the blocked throw, because "validated
and rejected" is precisely the event an operator needs. A throwing sink is
caught: a broken host reporting hook must not be misread as an export
failure.

**F-2 — dev-only diagnostics had no structural barrier (fixed in
CORE-P4-002).** The performance overlay is now gated on an explicit
non-production `NODE_ENV` *plus* an opt-in, reached only through a lazy
`import()`, and `check:bundle-budget` asserts its marker is absent from
both the entry and chrome chunks. Probe-verified: a static import from a
chrome component fails the gate.

## 5. Event privacy (§22.4 / §32.1)

The `EditorEvent` union is closed and every member carries counts, type
identifiers, and durations only. `assertContentFreeEvent` enforces this
mechanically — an undeclared key, an embedded URL, or a string over 128
characters throws — and is applied to every event shape including the
newly-emitted `export.validation`.

Diagnostic *export* redaction is handled upstream of the editor by
`writeStudioLog`, which shallow-redacts sensitive meta keys and normalizes
`Error` values before anything reaches a host logger. The editor's own
diagnostic center never routes document content into it: persistent
diagnostics are `EditorError` records keyed by stable codes, localized at
the UI layer, per the EP-23 scope boundary.

## 6. Residual risks

1. Non-authoring `<style>` injections still need a `style-src` allowance
   (§3).
2. `onValidation` is host-wired. Core ships no export UI of its own, so an
   integrating host that omits the sink observes no export events — the
   same trade-off every other adapter in `StudioEditorConfig` makes.
3. The greppable gates are textual by design. They see shipped bytes, not
   intent, and string-built evasions (`globalThis["ev"+"al"]`) are
   deliberately left visible rather than cleverly normalized away.
