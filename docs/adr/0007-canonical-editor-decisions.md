# ADR 0007: Canonical Puck-Native Rewrite — the seven gating decisions

**Status:** Accepted — all seven decisions signed off 2026-08-06
**Date:** 2026-08-06
**Resolves:** PLAN-0026 §1 rule 7 (the two contract-boundary decisions), §3.6, §5, §6, §3.8.6 (`D-FA-1`/`D-FA-2`/`D-FA-3`), §7 row 2
**Constrains:** `@anvilkit/contracts`, `@anvilkit/schema`, `@anvilkit/core`, `apps/studio` page storage, the banned-identifier gate
**Companion:** `docs/architecture/canonical-editor-naming-map.md` (the rename/delete map this ADR's decisions modify)
**Sign-off:** Owner, 2026-08-06. Five decisions accepted as recommended; **decision 5 was decided against the recommendation** and goes wider (`zIndex` included). Decision 7 is a determination on evidence, left standing.

## Context

The canonical Puck-native rewrite (PLAN-0026, scheduled by PLAN-0028) eliminates the sidecar editor architecture and its version vocabulary. PLAN-0026 §1 rule 7 states the operative constraint: *if a requirement cannot be met within the Unified Puck Contract, do not implement it — propose a Puck-native alternative and get agreement before writing code.* Two of its decisions touch the contract boundary directly (`editorAnnotations`, data finalization), and four more determine what later phases build. None was recorded anywhere in the repository before this ADR.

Each decision below states the question, PLAN-0026's recommendation, what accepting or rejecting costs, and **which task it gates**. A phase that starts against an unsigned decision is visibly out of order.

Recommendations are advice carried forward from PLAN-0026 §3.6, §5, §6 and §3.8.6. They are not decisions taken.

---

## Decision 1 — `editorAnnotations` (layer rename and lock)

**Gates:** `p3-006` · **Requirement:** DD-0019 `ED-FA-015` · **Contract rule touched:** 2

Layer rename and lock were dropped during P6-00 as having "no v2 equivalent", leaving a recorded LayersPanel UX regression. Restoring them contract-cleanly means a declared root prop `editorAnnotations` (node id → `{ name?, locked? }`), render-neutral and stripped by the exporters.

**Recommendation: adopt, with two conditions.**

1. **A permanently closed shape** — `Record<nodeId, { name?: string; locked?: boolean }>` and nothing else. A map that accepts arbitrary keys is the sidecar again under a new name, which is the exact thing this program exists to delete. Widening it later requires the same scrutiny as adding a root prop.
2. **Export stripping is real work, not a comment.** Root props round-trip through the IR in both directions (`packages/foundation/ir/src/puck-data-to-ir.ts:321-323`, `ir-to-puck-data.ts:71-72`), so `editorAnnotations` reaches every exporter unless removed deliberately. One shared strip helper with a per-format test, not a `delete` in each exporter.

Node-level props are the wrong home and should not be reconsidered: annotations are editor state *about* a node, not render state *of* it, and putting them in component props would force all 12 packages to declare two fields none of them reads.

**If rejected:** lock and rename are dropped permanently, the P6-00 LayersPanel regression becomes permanent, and `ED-FA-015` reduces to hide-and-search over the per-target `hidden` that already ships. `p3-006` is deleted from the plan and `p3-005`'s locked-node refusal and `p4-006`'s locked-node gesture guard both become no-ops.

**Decision:** **Adopt**, with both conditions — closed shape `Record<nodeId, { name?: string; locked?: boolean }>`, and one shared export-strip helper with a per-format test. Owner, 2026-08-06.
**Rationale:** Accepted as recommended. Restores the lock/rename capability P6-00 dropped, at the cost of exactly one declared root prop, with the closed shape as the structural guard against it becoming a sidecar by accretion.

---

## Decision 2 — Data finalization and the store-level `schemaRevision`

**Gates:** `p7-001`, `p7-002` · **Requirement:** DD-0019 `ED-FA-018` · **Contract rule touched:** 1

Version markers live in **stored documents**, not just code: `root.props.authoringSchemaVersion` (`contracts/src/editor/design-system.ts:42`), `appearance.version: "1"` (`schema/src/editor/appearance.ts:49,54,64`) and the `__anvilkitInstance` prop. The no-version end state therefore requires one final, one-way store migration. After it, no runtime code can read a pre-finalization document.

**Recommendation: sign off the one-way migration, and move the marker out of the document rather than deleting the concept.**

PLAN-0026 §5's original framing contains a false pair: the mandate bans version vocabulary **in the document**, and says nothing about the **store**. `PageRecord` (`apps/studio/lib/page-storage/types.ts:18-30`) already carries `id`, `slug`, `title`, `status`, `version`, `draft`, `published` and timestamps — its `version` is a *product* version derived from `root.props.version` and cannot be overloaded, but one new field can:

- `schemaRevision: number`, written by the storage layer, never by the document;
- documents stay free of version vocabulary, so the mandate is satisfied literally;
- the loader distinguishes "pre-finalization record" from "corrupt record" and emits a precise diagnostic instead of a generic "unsupported document format";
- recovery stops depending on someone locating a tagged release — a record below the floor routes to the migration path for as long as that path is kept alive.

Cost: one field plus one write-path change. It converts an irreversible cliff into a soft one without weakening the end state.

One addition to the P7 run-book either way: migrate a **copy** of the production store and diff the **rendered output**, not only schema validity (`p7-003`). Schema-valid and visually identical are different claims, and only the second is what "no user-visible change" means.

**If rejected** (migration signed off but `schemaRevision` declined): P7 still runs, `p7-001` is deleted, and the loader's only available response to an unmigrated record is the generic rejection. Recovery then depends entirely on the tagged release from `p7-004`.

**Decision:** **Sign off the one-way migration, and add `schemaRevision`.** Owner, 2026-08-06.
**Rationale:** Accepted as recommended. The mandate bans version vocabulary in the document, not in the store, so a storage-layer field satisfies it literally while converting an irreversible cliff into a soft one — the loader can distinguish a pre-finalization record from a corrupt one, and recovery stops depending on locating a tagged release.

---

## Decision 3 — Enforcement shape for the banned-identifier gate

**Gates:** `p0-002` (and `p8-011`'s flip to blocking) · **Contract rule touched:** 6

Two variants. **Identifier list:** one root gate script holds a tombstone list — the deleted exports' names, `__anvilkit`, `authoringSchemaVersion`, and the versioned filenames — as the single sanctioned place those names may appear. **Strict:** typecheck-by-absence only, with a gate limited to the two string-typed escapes, so the repo never names the old vocabulary at all.

**Recommendation: keep the identifier-list gate, and add a shrink rule.**

The strict variant reads purer and is weaker in practice. Typecheck-by-absence catches imports of deleted *exports*, but the two string-typed escapes are precisely the ones that survive as literals in JSON fixtures, migration code and stored documents — and those are how a sidecar returns quietly. A gate that may not name them cannot catch them.

Answer the aesthetic objection with mechanism instead: the gate **fails when a tombstoned identifier has zero hits repo-wide and is still listed**. The list must then be pruned as each name dies, so it behaves as a countdown to zero rather than a permanent museum of old vocabulary. At `p8-011` the list should be empty and the gate's own assertion proves it.

The gate must be an explicit identifier list, **never a substring scan**, under either variant: `v1`/`v2` substrings false-positive on Y.js `applyUpdateV2` (`plugin-collab-yjs/src/utils/yjs-adapter.ts`), Unsplash's `Accept-Version: v1` header, and product-release prose.

**If rejected:** `p0-002` builds the two-escape variant, and the 7 per-plugin compliance tests that embed the banned strings today cannot be replaced by it — `p6-007` would need to keep or re-home their vocabulary assertions rather than deleting them outright.

**Decision:** **Identifier-list gate with the shrink rule.** Owner, 2026-08-06.
**Rationale:** Accepted as recommended. Typecheck-by-absence cannot catch `__anvilkit` and `authoringSchemaVersion` where they matter most — as string literals in JSON fixtures, migration code and stored documents — and the shrink rule answers the "permanent museum" objection with mechanism: the list must shrink to empty by `p8-011`, and the gate itself proves it.

---

## Decision 4 — `D-FA-1`: theming scope

**Gates:** nothing in P0–P8 directly; it is recorded here so the rewrite does not pre-empt it · **Recorded in:** DD-0019 §36.5

Framer's styles are project-wide; ADR 0005 fixes a per-document model. This decision is explicitly *not* pre-empted by the rewrite — PLAN-0026 keeps ADR 0005's per-document model throughout.

**Recommendation: keep per-document; add a "propagate design system to pages" operation with a per-page diff.**

Framer's project-wide styles are better UX, but ADR 0005 Part 2 §3 rejected live cross-system aliases for a reason that has not changed: a live alias makes the same document render differently under different hosts and breaks byte-stable export unless the host theme becomes certified export input. Propagation captures most of the value at a fraction of the risk — an explicit origin, explicitly selected targets, a diff shown before writing (tokens added/changed/removed, plus which nodes reference a token whose value changes), written through the existing `designSystem` commit helper so it is one history entry per page with validation inherited.

Revisit only if authors report cross-page drift faster than they ask for project-wide styles; drift is the symptom that would prove per-document wrong.

**If rejected** (move to project-wide styles): this becomes an ADR 0005 amendment and a separate design cycle, not a change to PLAN-0026 — it would alter what a document *is* across both editors.

**Decision:** **Keep per-document, and add a "propagate design system to pages" operation with a per-page diff.** Owner, 2026-08-06.
**Rationale:** Accepted as recommended. ADR 0005 Part 2 §3's reason for rejecting live cross-system aliases has not changed — an alias makes the same document render differently under different hosts and breaks byte-stable export. Propagation captures most of the value with an explicit origin, explicit targets and a diff before writing. **Scheduling note:** the propagate operation is *not* a PLAN-0028 task; it lands after P8 or as a parallel track, and needs its own task before it can be built.

---

## Decision 5 — `D-FA-2`: authoring vocabulary width

**Gates:** `p1-004`, and downstream `p5-005` and `p6-003` · **Requirement:** DD-0019 `ED-FA-001`

`AuthorableStyleProperty` grants 23 properties (`contracts/src/editor/component-metadata-v2.ts:27-50`) while the spec vocabulary defines 40 (`specs.ts:30-78`: `LayoutSpec` 22 + `VisualStyleSpec` 8 + `TypographySpec` 10) — and the renderer **already serializes all 40**. The 17 ungranted are `direction`, `wrap`, `rowGap`, `columnGap`, `columns`, `rows`, `minHeight`, `maxHeight`, `inset`, `overflow`, `zIndex`, `filter`, `blendMode`, `cursor`, `textDecoration`, `textTransform`, `textWrap`. This is a contract-level allowlist decision, not a rendering gap, and it silently under-delivers three P0 requirements (`ED-LAYOUT-002` flex *and grid*, `ED-STYLE-001` effects, DD-0019 §4.1 position/overflow).

**Recommendation: all 17 in one P1 change, holding back `zIndex` — a new total of 39.**

Splitting into waves costs more than doing it once, because each wave re-opens the same four files (the union, `AUTHORABLE_PROPERTY_LOCATIONS`, the Zod enum, the inspector controls) and re-runs the same certification. `zIndex` is the single property in the set whose effect is non-local — raising a card's stacking changes its relationship to elements the author neither sees nor selected — so it is the defensible one to withhold, or to gate later behind a container-level opt-in.

Safety property worth noting: the compiler's allowlist filter and the inspector's control set read the **same** module (`core/src/puck/component-metadata.ts`), so widening what is grantable cannot make the two drift. `p6-003` then decides per component what is CSS-sane to actually grant, and `p8-006`'s computed-style honour check proves no element was granted a property it cannot honour.

**If rejected** (staged widening): `p1-004` ships a subset, `p5-005` builds only that subset's controls, and each later wave re-opens the same four files plus re-runs `p8-006`.

**Decision:** **All 17 additions, including `zIndex` — a new total of 40.** Owner, 2026-08-06. **This is a decision against the recommendation**, which advised holding `zIndex` back.
**Rationale:** The one-change argument is accepted, and extended: withholding a single property still leaves the 40th addition to a later wave that re-opens the same four files and re-runs the same certification, which is the cost the recommendation was trying to avoid. The authoring vocabulary now equals the spec vocabulary exactly — 40 grantable properties for 40 spec keys — which removes the "why is this one missing" question permanently and makes `p8-006`'s parity test a clean identity rather than an identity-minus-one.

**Consequences of the override**, carried into the tasks:

- `p1-004` widens to **40**, not 39, and carries no withhold comment.
- `p5-005` builds **17** controls, not 16, `zIndex` among them.
- `p6-003` may grant `zIndex`, but the non-local-effect concern that motivated the recommendation is real and does not disappear with the decision. It is re-homed as a **per-package review constraint**: `zIndex` is granted only on targets whose stacking is already scoped by a positioned ancestor, so raising it cannot reorder elements outside the component. Grants outside that condition are flagged for `p8-006`.
- `p8-006` asserts the count as **40** and asserts `zIndex` **present** across all four surfaces.

---

## Decision 6 — `D-FA-3`: where `ED-FA-002` (the component library) is built

**Gates:** the ordering of `p3-001` … `p3-003` versus `p3-009` · **Requirement:** DD-0019 `ED-FA-002`

`root.props.componentLibrary` is a declared root prop (`contracts/src/editor/design-system.ts:28-32,41`) written by the migration (`core/src/migrations/puck-native-v2.ts:509-523`) — and re-verified 2026-08-06 to have **zero readers or writers** outside contracts, that migration, the api-snapshot and one plugin test fixture. Every definition/variant/instance implementation reads the sidecar, and PLAN-0026 §3.1 deletes those files. Left uncorrected, the rewrite removes local components, variants, instances and detach from the product.

**Recommendation: inside P3, built first.**

Its risk profile is inverted from the rest of the plan: the danger is not that the replacement is late, it is that the sidecar implementation is **deleted on schedule while the replacement slips**. Building it first makes the deletion contingent on working code rather than on a date.

The exit gate is strengthened beyond the ADR 0005 Appendix A fixtures, because those fixtures are a test suite and PLAN-0028 defers tests to P8: `p3-003` requires a **real document** — created in the editor, saved, reloaded, with a variant switched and an override reset — to survive before any sidecar component file is deleted in `p3-009`. The Appendix A certification still runs, in `p8-004`.

**If rejected** (scheduled later): `p3-009` must not delete `core/src/editor/components/*`, and the plan needs an explicit statement of how long the sidecar component implementation is kept alive alongside the canonical write surface — which reintroduces, for one subsystem, the dual architecture this program exists to eliminate.

**Decision:** **Inside P3, built first.** Owner, 2026-08-06.
**Rationale:** Accepted as recommended. The sidecar component files are deleted in `p3-009` only after `p3-003`'s real-document round trip passes, so the deletion is gated by working code rather than by a date. This inverts the usual risk: the failure mode being guarded against is not a late replacement but an on-schedule deletion against a late replacement.

---

## Decision 7 — `EditorCommandPort` and external adopters

**Gates:** `p1-005` (retain or delete), `p8-011` (final removal) · **Source:** PLAN-0026 §7 row 2

PLAN-0026 offers a binary: state as a **verified fact** that no external adopters exist and delete on the original schedule, or keep `EditorCommandPort` exported as a type-only deprecated alias until P8 so external adopters get one version carrying both surfaces.

**Determination: retain the type-only deprecated alias through P8.** Evidence gathered 2026-08-06:

| Question | Evidence |
|---|---|
| Is the type in the published surface? | **Yes** — exported at `contracts/src/editor/index.ts:86`; 10 occurrences in `packages/foundation/contracts/api/api-snapshot.json` |
| Is the package published publicly? | **Yes** — `publishConfig.access: "public"`, not private, `@anvilkit/contracts@0.1.18` on the registry, `dist-tags.latest = 0.1.18`, last modified 2026-07-09 |
| Do external adopters exist? | **Not determinable.** npm reports 179 downloads of `@anvilkit/contracts` and 173 of `@anvilkit/core` for 2026-07-07 → 2026-08-05. Download counts cannot distinguish an adopter from CI, mirrors and registry bots, and those figures are consistent with either reading |

Since "no external adopters exist" is not verifiable from available evidence, PLAN-0026's own fallback applies. The alias moves to `contracts/src/editor/selection.ts` with `EditorSelectionState` when `commands.ts` is deleted, joins the `p0-002` tombstone list with `p8-011` named as its removal task, and ships with adoption notes pointing at `EditorApi` (`p3-008`).

This is a determination on evidence rather than a preference. **If the owner has out-of-band knowledge of the adopter set** — a private registry, a known consumer list, or confirmation that the package has only ever been installed by this repo's CI — that supersedes the determination and `p1-005` deletes the type on the original schedule.

**Decision:** ~~Retain the alias~~ → **OVERRIDDEN 2026-08-06: the Port leaves the published surface.** Owner decision during `p1-005`.
**Rationale:** The original decision was **not achievable as written**, and the ADR missed it by not tracing the type closure. `EditorCommandPort.getSnapshot()` returns `EditorCommandSnapshot`, whose `authoring` member is typed `AuthoringStateV1` — the sidecar itself. Retaining the Port therefore transitively republishes the entire 40-export command IR **and** the sidecar contract that `p1-005` exists to remove, until `p8-011`. "Retain one type-only deprecated alias" was in fact "retain everything".

Faced with that, the owner chose to drop the Port from the published surface. It moved with the rest of the cluster into `packages/runtime/core/src/editor/legacy/` and is deleted with the engine in `p3-009`. This accepts a one-version break for any external adopter, on the §7 evidence that adopters could not be confirmed to exist (179 downloads/month, indistinguishable from CI and mirrors).

**Consequence:** the `p0-002` tombstone entry for `EditorCommandPort` keeps `p8-011` as its `dies` task — it is now core-internal rather than published, but it is still a name that must reach zero.

---

## Consequences

- Decisions 1, 2, 5 and 6 each change what a later task builds; `p3-006`, `p7-001`, `p1-004` and the `p3-001`/`p3-009` ordering all read this ADR before starting.
- Decision 3 changes what `p0-002` builds and whether `p6-007` can delete the per-plugin compliance tests outright.
- Decision 4 changes nothing in P0–P8; it is recorded so that "the rewrite kept per-document theming" is a decision rather than an omission.
- Decision 7 adds one retained export to the published surface for the duration of the program, and one tombstone entry that `p8-011` must clear.
- Every decision left `pending` blocks its gating task. `p0-001` is not complete until all six carry an accept/reject.

## References

- `docs/plans/0026-canonical-puck-native-rewrite-plan-0806-0029.md` §1, §3.6, §3.8.6, §5, §6, §7
- `docs/plans/0028-canonical-puck-native-rewrite-phased-execution-0806-1023.md` §7
- `docs/architecture/canonical-editor-naming-map.md`
- `docs/prd/0019-anvilkit-core-visual-editor-detailed-design-0721-2052.md` §36 (`ED-FA-001`, `ED-FA-002`, `ED-FA-015`, `ED-FA-018`)
- `docs/adr/0005-cross-editor-component-and-token-alignment.md` (per-document theming; Appendix A certification fixtures)
