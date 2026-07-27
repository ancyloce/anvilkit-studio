# ADR 0006: Binding and `_dataSource` Coexistence

**Status:** Proposed — required by PLAN-0020 `CORE-P3-007`; resolves DD-0019 `OQ-007`
**Date:** 2026-07-26
**Resolves:** DD-0019 `OQ-007` (who owns binding query descriptors)
**Constrains:** `@anvilkit/ir` `data-source.ts`, `@anvilkit/core/editor` bindings, EP-17 export work
**Sign-off:** Not yet recorded. This ADR is written by the Phase 3 implementer and states a
recommendation; it is not an approval.

## Context

Two data mechanisms now exist in the repository, introduced two years and one design document
apart, and DD-0019 §19 closes with the requirement that there be **one migration story, not
three adapter idioms**. This ADR is that story.

### What exists today

**`_dataSource` (PRD 0004 F11)** — `packages/foundation/ir/src/data-source.ts`. A reserved
prop key (`_dataSource`) carrying a directive on a node. Exactly one kind ships:
`{ kind: "remote_csv", url }`. It is a **server-render injection channel**: a server-side
adapter reads the directive, executes the query, and injects synthesized data as ordinary props
*before* `<Render>`. Components never fetch. Because it is a plain serializable object it
survives `puckDataToIR` → `irToPuckData` losslessly.

**Bindings (DD-0019 §19, Phase 3)** — `AuthoringStateV1.bindings`, a sidecar map of
`BindingV1 { nodeId, target, expression, fallback }`. Bindings are an **editor-time** concept:
a `SafeExpression` is evaluated against a scope to drive a prop, a visibility condition, or a
repeat. Preview data comes from a host `EditorDataSourceAdapter` under the §19 caps, and Core
stores descriptors and expressions but never responses.

### Why they are not the same thing

They answer different questions and run at different times:

| | `_dataSource` | Binding |
|---|---|---|
| Runs | Server, before `<Render>` | Editor (preview) and exporter (materialization) |
| Owns | *Where data comes from* | *How a node reads from data already in scope* |
| Stored in | Node props (IR-visible) | Sidecar (`__anvilkit.bindings`) |
| Shape | Closed directive union | `SafeExpression` AST |
| Fetches | Yes — it is the fetch | No — it never performs I/O |

The failure mode this ADR exists to prevent is treating them as competing answers to "how does
a page get data", concluding one must replace the other, and shipping a third mechanism that
does a bit of both.

## Decision

### 1. `_dataSource` remains the server-render injection channel, unchanged

No deprecation, no migration of existing documents, no new directive kinds required by Phase 3.
It keeps its prop key, its IR round-trip, and its server-side execution model.

### 2. Bindings never fetch

A binding reads from a scope (`data`, `item`, `index`, `page`). It has no URL, no adapter
reference, and no I/O of its own. The editor populates `data` from the host
`EditorDataSourceAdapter` for **preview only**; at render time the scope is populated by
whatever the host already does — including `_dataSource` injection.

### 3. The two compose through the scope, and that is the only contact point

This is the migration story in one line: **`_dataSource` fills the scope; bindings read it.**

A node whose subtree carries a `_dataSource` directive has its synthesized props injected before
render. A binding on that node addressing `data.*` reads those props. Neither mechanism knows
about the other — the scope is the seam, so no coordination code exists to drift.

Concretely, an author who today writes a `remote_csv` directive and hand-wires props can, with
no document migration, add a binding that reads the same injected data and gains conditions and
repeats over it. The directive is untouched.

### 4. OQ-007 — **confirmed as recommended**: adapter-owned opaque descriptors

DD-0019 §33's recommended default is adopted without amendment. `DataSourceDescriptor` is
`{ id, name, description? }` and Core treats the `id` as **opaque**: it is stored, compared,
and handed back to the adapter, never parsed. Query semantics belong to the host.

Rationale, and why the alternatives were rejected:

- **Core-owned query descriptors** would require Core to model a query language covering every
  host backend, which is the "third idiom" §19 forbids. It also drags credentials toward Core:
  a query Core understands is a query Core is tempted to execute.
- **Reusing `DataSourceDirective`** would couple the editor to a server-render union that ships
  exactly one CSV kind, and would push binding concerns into IR where the exporter would then
  have to interpret them.

Size validation stays where §19 puts it — on the *response*, in
`editor/bindings/preview-data.ts` (5 s / 2 MiB / 50 records) — not on the descriptor. The
descriptor is host-authored identity; the response is untrusted payload.

### 5. No third idiom

Any future proposal to let bindings fetch, or to let `_dataSource` carry expressions, amends
this ADR first. Both would collapse the seam in §3.

## Consequences

**Positive.** No document migration. No change to `data-source.ts` (verified: the file needs no
edit for Phase 3). The editor never holds credentials, because it never constructs a query.
The exporter's job stays narrow — materialize expressions against a scope the host fills.

**Negative / accepted.** An author cannot create a data source from inside the editor; they pick
from what the host offers. That is deliberate for v1 and matches the token system's
import-as-copy stance in ADR 0005 (Core models, hosts supply). Hosts wanting authoring UI for
sources build it themselves and expose the result through `listSources`.

**Open.** Whether the exporter should emit `_dataSource` directives for binding-authored
repeats is **not** decided here; it is EP-17 work and depends on the reference exporter's
capability declaration (currently `supportedFeatures: []`, see the Phase 2 report).

## Verification

- `packages/foundation/ir/src/data-source.ts` — unchanged by Phase 3; `DATA_SOURCE_PROP` and
  `getDataSourceDirective` keep their contract.
- `packages/runtime/core/src/editor/bindings/evaluate.ts` — the evaluator has no I/O surface:
  its only inputs are an AST and a plain scope object.
- `packages/runtime/core/src/editor/bindings/preview-data.ts` — response caps live here, and
  the module holds no cache, so preview responses cannot become persisted state.
