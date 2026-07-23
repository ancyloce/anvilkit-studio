# ADR 0005: Cross-Editor Component and Token Model Alignment

**Status:** Proposed — blocks Phase 2 of DD-0019 and the E4–E6 technical design of PRD 0013 until accepted
**Date:** 2026-07-21
**Resolves:** DD-0019 `OQ-009` (token system relationships) and `OQ-010` (component model alignment)
**Constrains:** PRD 0013 Open Questions 3, 5, and 9
**Sign-off:** Runtime, Components, Export, Design (per DD-0019 reviewer list)

## Context

Two detailed specs written the same day propose parallel systems for two different editors:

- **DD-0019** adds local components, instances, variants, and per-document design tokens to the **Puck page editor** (`@anvilkit/core`, authoring sidecar at `root.props.__anvilkit`).
- **PRD 0013** adds components, instances, variants, brand components, and `BrandTokenRef`-governed values to the **Konva canvas editor** (`@anvilkit/canvas-core`/`-editor`, Canvas IR).

Neither document references the other (feasibility review 0009, §4.2–4.3). The IRs are different and the implementations cannot be shared, but both define the same concepts: definition vs instance, exposed properties, override patches, variant axes, detach, propagation, cycle prevention. Meanwhile the workspace already has three token systems — `@anvilkit/plugin-design-system` (config-time theme tokens, `--ak-ds-*` CSS vars, dark-mode overrides), canvas `BrandTokenRef` (single external resolver, `resolveBrandToken`), and `@anvilkit/tailwind-config` (build-time CSS themes) — and DD-0019 adds a fourth (per-document tokens with modes and aliases).

Without a deliberate alignment decision, the product ships two subtly different component models and multiple unrelated "token" pickers, which is incoherent for users, component authors, exporters, and AI tooling.

A structural constraint shapes the solution: the canvas packages are independently published submodules that deliberately avoid depending on `@anvilkit` runtime/foundation packages (the canvas-editor i18n prop-injection bridge is the established precedent). Alignment therefore cannot be enforced through a shared type package.

## Decision

Alignment is **by normative convention and shared certification fixtures, not by shared code**. Two parts.

### Part 1 — Component model alignment (resolves OQ-010)

**1. Normative glossary.** Both editors use these terms, in types (with domain prefixes), UI strings, and docs:

| Term | Meaning (both editors) |
|---|---|
| Component definition | The versioned source of truth: root tree, exposed properties, variant axes. Never rendered directly on a page/canvas. |
| Instance | A node referencing a definition by stable ID + version/revision, carrying variant selection and overrides. Never persists a resolved copy. |
| Exposed property | A definition-declared, stably-identified property an instance may set. |
| Override | An instance-local patch targeting a stable definition-node/slot ID. |
| Variant axis / value / selection | Stable-ID axis with an allowed value set; an instance selects `Record<axisId, valueId>`. |
| Detach | Materialize the resolved result into ordinary nodes with new IDs; visually identical; removes future inheritance; one undo entry. |
| Propagate | Definition edits flow to instances without per-instance tree copies. |
| Orphan override | An override whose target no longer exists: retained as diagnosable data, never reapplied elsewhere, never silently dropped. |

Type naming: page model uses the DD-0019 names (`ComponentDefinitionV1`, `ComponentInstanceState`, `VariantAxis`); canvas prefixes with `CanvasComponent*` and must use `CanvasComponentVariant*` to avoid the existing campaign-resize "variant" collision (PRD 0013 VR-001 naming note). UI copy must disambiguate component variants from page-size variants.

**2. Shared invariant checklist.** Both implementations must satisfy every row; each row becomes a certification fixture in both test suites:

| Invariant | DD-0019 anchor | PRD 0013 anchor |
|---|---|---|
| Definition separate from instance; no authoritative resolved copies | §14.2, DD-DEC-009 | CP-001, CP-002 |
| Stable override addressing (IDs, never array indices; rename-safe) | §14.2 | OV-002 (`TemplateSlotBase` pattern) |
| Pure resolver: definition + variant + props + overrides → tree + diagnostics; preview, hit-testing, and every export path consume the same resolution | §24.4, §23.1 | CP-003 |
| Runtime expansion IDs namespaced (`${instanceNodeId}::${definitionNodeId}` or equivalent) and never persisted | §14.2 | CP-003 |
| Resolution precedence: definition base → variant patch → exposed properties → instance node overrides (→ breakpoint overrides, page model only) | §14.4 | CP-003, OV-* |
| Creation is one atomic undo entry (create definition, replace selection, select instance) | §10.5 | CP-004 |
| Cycle rejection before commit with full-path diagnostics; explicit depth caps | §14.4, ED-COMP-005 | CP-004 |
| Propagation without per-instance copies; valid overrides survive | ED-COMP-002 | CP-006 |
| Orphan overrides are diagnosable data | §14.2 | OV-002, CP-006 |
| Detach materializes with new IDs, no visual change | ED-COMP-004, §14.4 | CP-005, OV-003 |
| Variant switching preserves compatible overrides; incompatible ones become diagnostics | ED-VARIANT-002 | VR-001 |
| Missing/broken definition → selectable placeholder + structured warning | §25 failure table | CP-003, CP-007 |
| Deleting a referenced definition requires confirmation (block or detach-all) | `ED-COMP-006`, §14.6 (adopted 2026-07-21) | CP-007 |
| External/unavailable library: references and overrides retained, re-resolve later | `ED-COMP-007`, §14.6 (adopted 2026-07-21) | CP-007 |
| Override reset granularity: one, all, and promote-to-default | `ED-COMP-008`, §14.6 (adopted 2026-07-21) | OV-003 |

DD-0019 adopts the three flagged rows from PRD 0013 as Phase 2 requirements. Conversely, PRD 0013's technical design adopts DD-0019's explicit numeric caps discipline (nesting depth, variants per component, axes per component — values may differ per medium, but caps must exist and produce stable validation errors, not truncation).

**3. Overridable surface baseline.** Both first releases expose at minimum: plain text, rich text, image/asset, color-token-capable fill, visibility, and component/slot swap. Structural patches (hierarchy, transforms, arbitrary objects) are not overridable unless the definition declares them.

**4. Enforcement without coupling.** No shared package. Alignment is enforced by: (a) this ADR's glossary and checklist as the normative reference in both technical designs; (b) mirrored error-code string values (`*_COMPONENT_CYCLE`, `*_ORPHAN_OVERRIDE`, etc. — same suffix vocabulary, domain prefixes); (c) the certification fixture list in Appendix A, implemented in both repos' test suites under shared fixture IDs; (d) design review of either Phase 2 requires checking against this ADR.

**5. Brand governance stays canvas-scoped.** PRD 0013 E6 (brand components: locked nodes, compliance levels, host-owned permissions) is canvas-only for now, but its policy seams define the pattern any future page-side governed component must follow.

### Part 2 — Token system alignment (resolves OQ-009)

**1. Three user-facing roles, fixed labels.** Every UI surface, doc, and API description uses exactly these names:

| Label | System | Lifecycle & owner |
|---|---|---|
| **Theme tokens** | `@anvilkit/plugin-design-system` | Config-time, host-owned; `--ak-ds-*` CSS vars; dark-mode overrides |
| **Brand tokens** | Canvas `BrandTokenRef` + brand kit | Per-brand governed values, host/library-resolved |
| **Document tokens** | DD-0019 `AuthoringStateV1.tokens` | Per-document, user-authored, mode-aware, data-carried |

`@anvilkit/tailwind-config` is build-time styling for chrome and components; it is explicitly outside the authoring model and never surfaces in a token picker.

**2. One resolution idiom everywhere.** Adopt the canvas single-resolver pattern: each system exposes exactly one public resolve function (`resolveBrandToken` is the precedent; DD-0019's `resolveToken` follows it), consumers — inspector, canvas preview, exporters, compliance checks — never re-implement resolution.

**3. No live cross-system aliases in v1.** Document tokens may not alias theme or brand tokens at resolution time. Rationale: theme tokens are host-config-scoped, so a live alias would make the same document resolve differently under different hosts and break DD-0019 §23's byte-stable export requirement unless the theme becomes certified export input. Instead, the token picker supports **import-as-copy with provenance**: importing a theme value creates a document token whose value is the resolved literal and which carries an additive provenance field (`source?: { system: "theme" | "brand"; ref: string }` on `DesignToken` — a required additive amendment to the DD-0019 §9.4 contract). In v1 the field is provenance recording only; active re-sync and drift detection require a token-source adapter defined in a future design. Live theme aliasing is a post-v1 decision, revisited together with exporter CSS-custom-property certification.

**4. One picker pattern.** A single token-picker UX contract across editors: filter by compatible type, search, recent, provenance badge (Document / Theme / Brand), resolved-value display with alias chain, detach-to-literal, create-from-literal. The page editor surfaces document tokens plus theme values (via import-as-copy); the canvas editor surfaces brand tokens as it does today. No parallel bespoke pickers.

**5. No unified super-token type.** `BrandTokenRef` stays canvas-scoped; `DesignToken` stays page-scoped; theme tokens stay config-scoped. A unifying abstraction is rejected as premature (Reuse-First: extract shared models at a third real call site, and the lifecycles/owners genuinely differ). Mode vocabulary is reserved for coherence: document-token mode IDs `light`/`dark` must mean the same thing as the theme system's dark overrides so a future bridge is possible.

## Alternatives Considered

- **A shared contracts package for component/token types across page and canvas.** Rejected: canvas packages are independently published submodules that deliberately avoid `@anvilkit` foundation/runtime dependencies (i18n prop-injection precedent); coupling them for type identity alone inverts an intentional boundary.
- **Live aliasing of theme tokens from document tokens in v1.** Rejected: breaks deterministic export unless host theme becomes certified export input; import-as-copy with provenance preserves the workflow value without the coupling.
- **Merging the four token systems into one.** Rejected: different lifecycles (build / config / brand / document) and different owners; forced unification is premature abstraction.
- **Letting each PRD proceed independently.** Rejected: two divergent component vocabularies and multiple token pickers in one product; the review flagged this as unacceptable and both documents now gate Phase 2 on this ADR.

## Consequences

- DD-0019 `OQ-009`/`OQ-010` resolve to this ADR; DD-0019 gains three Phase 2 requirements from the checklist (definition-deletion confirmation, library-unavailable retention, override reset granularity) and one additive contract amendment (`DesignToken.source` provenance).
- PRD 0013's E4–E6 technical design must adopt the glossary, the checklist, `CanvasComponentVariant*` naming, and explicit numeric caps; its Open Question 5 resolves toward unifying Template Slots into the component-property model (the checklist's stable-addressing row assumes it), and Open Question 9's variant shape must match the shared axis/selection contract regardless of whether the first release is single-axis.
- Both repos implement the Appendix A certification fixtures when their component phases start; either phase's design review checks against this ADR.
- UI copy standardizes on Theme / Brand / Document token labels and disambiguates component variants from page-size variants.

## Follow-up Actions

- DD-0019 cross-references: **done** (2026-07-21) — §33 `OQ-009`/`OQ-010` marked resolved; §14.5 and §15.2 reference this ADR.
- PRD 0013 pointer: **done** (2026-07-21) — §18 references this ADR for Open Questions 3, 5, and 9 and pulls Appendix A into the E4–E6 test plan.
- `DesignToken.source` provenance field: **done** (2026-07-21) — added to the DD-0019 §9.4 contract as `DesignTokenSource` ahead of acceptance, well before the Phase 2 schema freeze.
- Certification fixture list: **done** (2026-07-21) — derived in Appendix A; each repo implements the fixtures when its component phase starts.
- Post-v1: revisit live theme aliasing together with exporter CSS-custom-property certification.

## Appendix A — Certification fixture list

Derived one-to-one from the Part 1 invariant checklist (`CFX-C*`) and the Part 2 token decisions (`CFX-T*`). History-related pass criteria assume **isolated intents**: each fixture separates history-recording dispatches by more than Puck's 250 ms record debounce, so "one history entry" is exact under DD-0019's single-intent history rule (§10.5). Each fixture is implemented in **both** test suites against its own IR — page editor under `@anvilkit/core` `./testing/editor` (DD-0019 §22.2), canvas under the `@anvilkit/canvas-core`/`-editor` suites — using the shared fixture IDs below so cross-editor coverage is auditable. A failing fixture blocks that repo's component phase. Domain-specific layers are noted where the editors legitimately differ (breakpoint overrides exist only in the page model; component swap and transforms only in canvas).

### Component fixtures

| ID | Checklist row | Fixture (setup → operation) | Pass criterion |
|---|---|---|---|
| `CFX-C01` | Definition/instance separation | Create a definition and two instances → serialize the document | Serialized instances carry reference, variant selection, and overrides only — no resolved subtree; document size does not scale with instance count × definition size |
| `CFX-C02` | Stable override addressing | Create overrides → rename the target node → reorder siblings so indices shift | Overrides still apply to the same targets; an index-keyed override fails schema validation |
| `CFX-C03` | Shared resolution | Resolve one instance → feed preview render, hit-testing, and every export path | All consumers receive the identical resolved tree (deep-equal snapshot); no path re-resolves independently |
| `CFX-C04` | Runtime ID namespacing | Resolve nested instances → collect generated IDs → save | Generated IDs follow the namespacing scheme, never collide with document node IDs, and none is persisted |
| `CFX-C05` | Resolution precedence | Set the same property at every layer: definition base, variant patch, exposed property, node override (+ breakpoint override, page model only) | Resolved value follows the fixed precedence; removing each layer in turn falls back to the next lower layer |
| `CFX-C06` | Atomic creation | Create a component from a multi-node selection → undo once | One undo restores the exact pre-creation document and selection |
| `CFX-C07` | Cycle and depth rejection | Attempt A→B→A nesting; attempt nesting beyond the depth cap | Both rejected before commit with full-path diagnostics (`…A→B→A`); document unchanged |
| `CFX-C08` | Propagation without copies | Edit definition structure and defaults with N instances carrying valid overrides | All instances reflect the edit; overrides intact; command/patch size independent of N |
| `CFX-C09` | Orphan overrides | Delete a definition node targeted by an instance override | Override retained as diagnosable orphan data with a diagnostic; never applied to another node |
| `CFX-C10` | Detach materialization | Detach an instance carrying a variant selection and overrides → compare rendered output | Visually equivalent output; all-new node IDs; later definition edits do not affect detached nodes; one history entry |
| `CFX-C11` | Variant override compatibility | Switch variants where the override target survives, and where it does not | Compatible override preserved; incompatible override becomes a diagnostic, never silently dropped |
| `CFX-C12` | Missing definition | Load a document referencing an unknown definition ID | Selectable placeholder plus structured warning; no crash, no silent node removal |
| `CFX-C13` | Deletion confirmation | Delete a referenced definition accepting detach-all; repeat under a blocking policy | Detach-all is one atomic batch and one history entry; blocking policy refuses; no committed state references a deleted definition |
| `CFX-C14` | Source retention | Resolve while the definition source is unavailable → restore the source | Instance data unchanged through the outage; distinct library-unavailable placeholder reason; automatic re-resolution on restore |
| `CFX-C15` | Reset granularity | Reset one override; reset all; promote one to default | Reset-one removes only its target; reset-all returns to definition-plus-variant resolution; promote updates the definition default, propagates, and removes the redundant override in the same commit; each operation is one history entry |

### Token fixtures

| ID | Part 2 decision | Fixture (setup → operation) | Pass criterion |
|---|---|---|---|
| `CFX-T01` | Single-resolver idiom | Resolve the same token reference through inspector, preview, and export consumers | Every consumer calls the system's one public resolver; identical results; no duplicated resolution logic (import-boundary check) |
| `CFX-T02` | No live cross-system aliases | Author a document-token value that references a theme or brand token as an alias | Rejected by schema: only `literal` and same-system `alias` kinds parse |
| `CFX-T03` | Import-as-copy provenance | Import a theme value as a document token | Result is a literal plus `source { system, ref }`; resolution is identical with `source` stripped; generated output is byte-identical with and without `source` |
| `CFX-T04` | Alias depth and cycles | Author an alias chain at the depth limit, one past it, and a cycle | At-limit chain resolves; past-limit and cycle fail with stable error codes; export is blocked on the cycle |
| `CFX-T05` | Reserved mode vocabulary | Define document-token modes `light` and `dark` | Modes resolve per mode; the reserved meaning of `light`/`dark` is documented to match the theme system's dark overrides (documentation check — active drift tooling is out of v1 scope) |
