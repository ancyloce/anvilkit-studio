# ADR 0008: Canvas Masking — shape masks, the `maskAssetId` disposition, and the Elements panel restructuring

**Status:** **Accepted** — recommendations recorded 2026-08-07; **all four decisions approved by the owner (ancyloce) on 2026-08-07.** P4 is unblocked, and `cp3-003`/`cp3-009` are unblocked.
**Date:** 2026-08-07
**Resolves:** PLAN-0035 §5 P0 (`cp0-004`), §6 rows 1 and 3
**Constrains:** `@anvilkit/canvas-core`, `@anvilkit/canvas-editor`, `apps/studio` canvas E2E, `apps/docs` playground E2E
**Companion:** `docs/tasks/cp0-004-adr-masking-design-decision.md`; evidence base `docs/analysis/0022-canvas-vs-canva-express-gap-0806-1311.md` (row `D-6`)
**Sign-off:** **None recorded.** This document is written by an agent and carries **recommendations only**. No owner approval is implied by any row below; each decision needs an explicit yes/no from the repository owner before its gating task starts.

## Sign-off status — read this first

| # | Decision | Recommended answer | Gates | Sign-off |
| --- | --- | --- | --- | --- |
| 1 | Does `frame` + `placeholder` + `clip` already cover the shape-mask interaction? | **Partly — the *interaction* yes, the *geometry* no.** Rect/rounded-rect only; no ellipse, polygon, star, path or text clip exists on either render path | all of P4 (scopes `cp4-001`…`cp4-004`) | Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)** |
| 2 | New optional field on the image node, or an extension of `frame`? | **Extend `frame`** — one optional `CanvasFrameNode.shape`, absent = today's rectangle | `cp4-001`, `cp4-002`, `cp4-003` | Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)** |
| 3 | Is `maskAssetId` worth finishing, or deprecated and removed? | **Deprecate now, remove at `@anvilkit/canvas-core@1.0.0`.** Six live consumers stay wired; only the TSDoc, the warning message and the removal schedule change | `cp4-007` | Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)** |
| 4 | Elements panel restructuring (user-visible breaking change) | **Proceed, with three conditions** — changeset for the published break, extension-tool overflow regression stated, docs E2E in the verification set | `cp3-003`, `cp3-009` | Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)** |

A phase or task starting against a pending decision is visibly out of order.

## Context

PLAN-0035 §6 lists shape-mask-vs-alpha-mask and the disposition of the IR-node `maskAssetId` as the decision gating all of P4, and lists the Elements panel restructuring as the decision gating `cp3-003`/`cp3-009`. `docs/tasks/README.md:209-214` records both, and names *this* ADR as the home of the Elements-panel decision. Nothing was recorded anywhere in the repository before this file.

The framing question is narrower than "should Canvas support masking". Canvas already clips: a `frame` owns its bounds, can clip its children to them, and can act as an image *well* that an image is dropped into. What it cannot do is clip to anything that is not a rectangle. Meanwhile `CanvasImageNode.maskAssetId` exists, is settable through the public builder, and is rendered by nothing.

**Two same-named fields must not be confused** (PLAN-0035 §6 makes this a precondition of the ADR, and it is verified here):

| Field | Location | State |
| --- | --- | --- |
| **IR node** `CanvasImageNode.maskAssetId` | `canvas/core/src/ir/types.ts:750` | Unrendered. This ADR's decision 3 disposes of it |
| **AI request** `maskAssetId` | `canvas/core/src/ai-contracts.ts:22` (`inpaint`), `:49` (`generative-fill`), `:68` (`object-erase`) | Live and shipping. Consumed by `apps/studio/lib/ai-image/replicate-image-provider.ts:96,113` and the route at `apps/studio/app/api/canvas/ai/inpaint/route.ts:13`. **Untouched by this ADR** |

The AI field is a wire parameter for a remote inpainting job. It shares only a name with the IR field and is not in scope.

Every `file:line` below was re-opened against the working tree on 2026-08-07 — see **Verification record**.

---

## Decision 1 — Does `frame` + `placeholder` + `clip` already cover the shape-mask interaction?

**Gates:** all of P4; directly scopes `cp4-001`, `cp4-002`, `cp4-003`, `cp4-004`

### What ships today

The *interaction* — "put my photo in this thing, and let me nudge it inside" — is built, end to end, on both render paths:

- **The IR container.** `CanvasFrameNode` owns `children`, `clip`, `background`, `placeholder`, `radius`, `cornerRadii`, `autoLayout` (`core/src/ir/types.ts:492-512`). `FramePlaceholder` marks a frame as an image or logo well and carries the filling `assetId` and an optional brand token (`:466-484`).
- **Konva clips it.** `frameClipProps` returns `clipX/clipY/clipWidth/clipHeight` for a square frame and a `clipFunc` calling `ctx.roundRect(...)` for a rounded one (`editor/src/stage/CanvasNodeRenderer.tsx:251-276`), applied on the frame's `<Group>` (`:333`).
- **SVG clips it losslessly.** `emitFrame` emits `<defs><clipPath>` over the frame's box and hangs `clip-path` on the `<g>` (`core/src/serialize/svg.ts:1862-1867`), geometry shared with the background through `frameBoxElement` (`:1834-1839`) so the two can never disagree. The serializer states outright that frame `clip` is fully representable and therefore carries no fidelity warning (`:104-107`).
- **A frame never flattens.** A resolved placeholder is carried by an `<image>` **child** that is clipped by the frame rather than baked into it (`svg.ts:1786-1796`, `:1841-1852`).
- **Drop-onto-shape works.** `resolveDropTarget` resolves a dragged image to an existing image node or an image-well frame, container-aware and paint-ordered (`editor/src/workspace/uploads/drop-target.ts:24-26,42-73`).
- **Filling is one undo step, cover-scaled, non-destructive.** `buildFillFrameCommands` produces three shapes — replace in place, insert cover-sized, or plain insert — as a single batch (`editor/src/selection/frame-image-actions.ts:89-120`), with `coverGeometry` implementing CSS `object-fit: cover` semantics (`:49-66`).
- **Reposition-within is the crop gesture.** `beginCrop` is imported into the frame/image inspector (`editor/src/panels/inspector/media-sections.tsx:25`) over `editor/src/selection/crop-actions.ts`.
- **There is an inspector control.** An "Image well" switch turns `placeholder` on and off non-destructively, plus Replace image, Reset crop, and brand-logo binding (`editor/src/panels/inspector/media-sections.tsx:495-536,537-584`).
- **The two paths already agree on the empty-well fallback.** `#e2e8f0`, duplicated deliberately with a comment binding the two (`CanvasNodeRenderer.tsx:279-284`, `svg.ts:1767-1773`).

### What does not ship

**Any clip geometry that is not a rectangle.** Both clip implementations are closed over rect and rounded-rect:

- Konva: `clipX/Y/Width/Height`, or `roundRect` with `cornerRadii`, or `roundRect` with a scalar `radius` (`CanvasNodeRenderer.tsx:251-276`). No other branch exists.
- SVG: `<rect>` with optional `rx`/`ry`, or a `roundedRectPath` when `cornerRadii` is set (`svg.ts:1818-1839`, `roundedRectPath` at `:836`).

There is no ellipse, polygon, star, path or text clip on either path, and no IR field that could request one. `frame` is the only container besides `group` (`core/src/ir/types.ts:520`), and `group` has no bounds of its own.

One consequence is worth naming because it is free value nobody can find: **a square frame with `radius` equal to half its side already clips to a circle on both paths** — SVG clamps `rx`/`ry` to half the box, and `CanvasRenderingContext2D.roundRect` scales overlapping radii down proportionally. The circle mask, the most common shape mask in the benchmarked products, is reachable today by typing a number into the radius field. *This is derived from the emitted markup, not from an executed render; `cp4-001` should pin it with a parity fixture before it is relied on.*

### Answer

**No — not fully. Partly.** The interaction layer is covered; the geometry vocabulary is not.

**Rationale (one line):** every behaviour `cp4-004` proposes to build — drag-onto, cover-fill, replace, reposition-within-mask, one-undo, editor↔export agreement — already ships for frames, but both clip implementations are closed over rectangles, so no non-rectangular mask can be expressed, rendered or exported.

**Executed by:** `cp4-001` (the resolver), `cp4-002` (SVG geometry), `cp4-003` (Konva geometry). **`cp4-004` is re-scoped** from "build the masking interaction" to "extend the existing image-well interaction to non-rectangular shapes, and make the well discoverable" — its `beginCrop` reuse deliverable is already satisfied, and its drag-onto-shape deliverable is already satisfied for frames.

**Date:** Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)**

**If rejected** (owner reads this as a full "yes"): `cp4-001`, `cp4-002` and `cp4-003` are deleted, P4 collapses to `cp4-004` as pure UX/discoverability work plus `cp4-007`, and Canvas ships with rectangle-and-circle masks only. That is a defensible product call — it is not what the code currently supports being described accurately.

---

## Decision 2 — Is the shape mask a new field on the image node, or an extension of `frame`?

**Gates:** `cp4-001`, `cp4-002`, `cp4-003`

PLAN-0035 §6 recommends extending `frame`. **Agreed, and for stronger reasons than the plan gives.**

**Recommendation: extend `frame` with one optional `shape` field. Do not add a clipping field to the image node.**

1. **A second clipping model is exactly what CLAUDE.md forbids.** "Never silently introduce a new pattern, dependency, directory convention, or architectural boundary." Two ways to clip an image — one on the container, one on the image — is a parallel architecture in the smallest possible package.
2. **The codebase already argues this position, in-tree.** `core/src/serialize/svg.ts:291-299` explains why there is deliberately no `FRAME_MASK_UNSUPPORTED` code: *"a frame has no mask field … and frame clipping IS losslessly representable as an SVG `<clipPath>`. A code that can never be emitted would be dead API."* The serializer's authors already reasoned about frame-vs-image masking and put clipping on the frame.
3. **Only a container can hold masked content.** `CanvasContainerNode = CanvasGroupNode | CanvasFrameNode` (`types.ts:520`). An image node has no children, so an image-node mask field cannot clip *content* — it could only clip itself, which requires its own compositing path in Konva and its own `<mask>`/`<clipPath>` emitter in SVG. That is the duplicated render pipeline `cp4-005` exists to police, created on purpose.
4. **The shape maths already exists and is already shared.** `computePolygonVertices` and `computeStarVertices` are pure and dependency-free (`core/src/geometry/polygon.ts:27,54`), consumed by `emitPolygon`/`emitStar` (`core/src/serialize/svg.ts:922,936`); `roundedRectPath` (`svg.ts:836`) and `emitEllipse` (`:899`) cover the rest. A `frame.shape` extension re-reads them. An image-node field would fork them.
5. **It composes with everything a frame already does** — background, Auto Layout, `radius`, placeholder, the well interaction, the non-flattening `<image>`-child contract. An image-node mask composes with none of it and would need each behaviour re-derived.

### Proposed shape

```ts
/** What geometry a clipping frame clips to. Absent = the rectangle frames clip to today. */
export type CanvasFrameShape =
	| { kind: "rect" }
	| { kind: "ellipse" }
	| { kind: "polygon"; sides: number }
	| { kind: "star"; points: number; innerRadiusRatio: number }
	| { kind: "path"; d: string };
```

added to `CanvasFrameNode` as `shape?: CanvasFrameShape` beside `clip` (`types.ts:492-512`). Constraints that must be written into the TSDoc and enforced in the resolver, not per consumer:

- **`shape` only takes effect when `clip` is `true`.** Otherwise it becomes a second, silent clipping trigger — the same mistake in a new place. `clip` stays the on/off switch; `shape` only says what the clip's geometry is.
- **`radius`/`cornerRadii` apply only to `kind: "rect"`** and are ignored otherwise. Stated, tested, and resolved centrally.
- **Optional and absent-by-default**, so every existing document parses and serializes byte-identically — which is also `cp4-006`'s "unmasked-document goldens unchanged" acceptance criterion.
- **`kind: "path"` reuses the existing `PATH_D_RE` guard** (`svg.ts:110`) rather than adding a second path validator.

`cp4-001`'s `resolveNodeMask` becomes **`resolveFrameClipShape(frame)`** — one normalized description that `frameClipProps` (`CanvasNodeRenderer.tsx:251`) and `frameBoxElement` (`svg.ts:1834`) both read. Note this *removes* duplication rather than adding it: the rect/rounded-rect branching is currently written twice, once per path.

**Answer:** extend `frame`.

**Rationale (one line):** clipping already belongs to the container in this IR, the container is the only node that can hold the clipped content, and the shape maths is already shared — an image-node field would fork the geometry, the compositing and the emitter to gain nothing.

**Executed by:** `cp4-001` (field + Zod + resolver), `cp4-002` (SVG `<clipPath>` geometry), `cp4-003` (Konva `clipFunc` geometry).

**Date:** Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)**

**Consequences carried into the tasks:**

- **`cp4-002` loses two deliverables.** Its `<mask>` emission deliverable is void (decision 3 declines alpha masks). Its "`IMAGE_MASK_UNSUPPORTED` removed for covered cases" deliverable is also void — that code is raised on `CanvasImageNode.maskAssetId` (`svg.ts:1991-1998`) and shape masks never reach it. Frame clipping already carries no fidelity warning (`svg.ts:104-107`), so shape masks inherit "no warning" for free. `cp4-002` becomes clip-geometry emission only.
- **`cp4-003` loses its alpha-mask deliverable** (`cache()` + `globalCompositeOperation: "destination-in"`). It must still compose correctly with the node's own `blendMode`, which the renderer applies at `CanvasNodeRenderer.tsx:124`.
- **`cp4-005`'s fixture set** drops the alpha-mask fixture and gains one fixture per `CanvasFrameShape` variant.
- `CanvasFrameNode` is a published type, so `cp4-001` moves the api-snapshot and needs a changeset.

**If rejected** (owner prefers a field on the image node): `cp4-001` defines `CanvasImageNode.mask`, `cp4-003` must build an image-level compositing path that cannot reuse `frameClipProps`, `cp4-002` must build a second `<clipPath>` emitter that cannot reuse `frameBoxElement`, and `cp4-005` becomes load-bearing rather than a safety net — it is then the *only* thing preventing the two masking implementations from diverging. Add ~1 week and re-open the `svg.ts:291-299` reasoning explicitly rather than contradicting it silently.

---

## Decision 3 — Is `maskAssetId` worth finishing, or should it be deprecated and removed?

**Gates:** `cp4-007`

### The field's actual state

Not "unreferenced" — **unrendered but load-bearing**. Six live consumers, verified:

| # | Consumer | Location | Role |
| --- | --- | --- | --- |
| 1 | `CanvasImageNode.maskAssetId` | `core/src/ir/types.ts:750` | The declaration. No TSDoc |
| 2 | `CreateImageOptions.maskAssetId` + the conditional spread | `core/src/ir/builders.ts:469`, `:488-490` | Public write path — a host can set it |
| 3 | `CanvasImageNodeSchema.maskAssetId` | `core/src/ir/validators.ts:559` | `z.string().min(1).optional()` inside a `z.looseObject` (`:551`) |
| 4 | `assetIdsReferencedByNode` | `core/src/ir/invariants.ts:68-69` | Reference-preservation invariant. Drop this and the referenced asset looks orphaned |
| 5 | Cross-document paste asset re-key | `core/src/clipboard/payload.ts:314` (rationale `:264`, mirror note `:309-312`) | Rewrites the ref when a pasted asset id collides |
| 6 | Clipboard asset-ref collection | `canvas-editor/src/actions/clipboard-actions.ts:113` | Carries the mask asset into the payload |

Plus the refusal: `IMAGE_MASK_UNSUPPORTED` in the warning union (`core/src/serialize/svg.ts:286`) raised at `:1991-1998` with the message *"Image masks are not represented in SVG."*, the header rationale at `:97-103`, and one test asserting the warning (`core/src/serialize/__tests__/svg.test.ts:1042-1054`).

**Confirmed: zero occurrences of `maskAssetId` in `canvas-editor/src/stage/CanvasNodeRenderer.tsx`.** No UI writes it either — no inspector control, no tool, no command. The only way to set it is a host calling `createImage({ maskAssetId })` directly, after which nothing renders it and export warns.

### Answer

**Deprecate. Do not finish it.**

**Rationale (one line):** the gap the evidence base actually records is shape-clip, not alpha-clip (`docs/analysis/0022-canvas-vs-canva-express-gap-0806-1311.md:106`), and finishing this field would buy a capability no UI can request at the cost of exactly the Konva `cache()` composite that PLAN-0035 §9 R-3 flags as the most likely way this program regresses drag.

### Exact instruction to `cp4-007` — take the **deprecate** branch

Execute the "if `cp0-004` chose **deprecate**" deliverable list in `docs/tasks/cp4-007-maskassetid-disposition.md`, resolved to these specifics. **Nothing in this list is a deletion of runtime behaviour.**

1. **`core/src/ir/types.ts:750`** — add `@deprecated` TSDoc naming ADR 0008, stating the migration is a clipping `frame` carrying `shape` (decision 2) with the image as its child, and naming `1.0.0` as the removal version.
2. **`core/src/ir/builders.ts:469`** — same `@deprecated` on `CreateImageOptions.maskAssetId`. **Keep** the option and the spread at `:488-490`; removing them is a compile break for any host that sets it.
3. **`core/src/ir/validators.ts:559`** — **keep the field in the schema.** `z.looseObject` (`:551`) would preserve the key regardless, but dropping the declaration would silently downgrade a typed field to an unknown key and lose the `min(1)` check. Documents carrying `maskAssetId` must keep parsing unchanged.
4. **`core/src/ir/invariants.ts:68-69`** — **keep reading it.** A deprecated reference is still a reference; drop it and the reference-preservation invariant starts reporting a false dangling asset.
5. **`core/src/clipboard/payload.ts:314` and `canvas-editor/src/actions/clipboard-actions.ts:113`** — **keep both.** `payload.ts:309-312` states in-tree that this field list must mirror `invariants.ts`'s enumeration, so items 4, 5 and 6 move together or not at all.
6. **`core/src/serialize/svg.ts`** — **retain `IMAGE_MASK_UNSUPPORTED`.** Never remove the union member: `:291-293` states the union only ever grows so a consumer switching on `SvgWarningCode` is never broken. Change only the message at `:1995` from *"Image masks are not represented in SVG."* to one that points at the frame shape mask and does **not** imply future support for this field.
7. **`core/src/serialize/svg.ts:97-103`** — update the header rationale. Its closing sentence, *"A future vector-mask implementation can start emitting real markup without changing the IR or breaking existing consumers"*, becomes false the moment this decision is signed: the vector-mask implementation lands on `frame`, not on this field.
8. **`core/src/serialize/__tests__/svg.test.ts:1042-1054`** — keep asserting the warning fires; update any message assertion.
9. **Removal scheduled for `@anvilkit/canvas-core@1.0.0`.** Both canvas packages are `0.1.2-rc.1` today, so this is the next major and the schedule is not open-ended. Add a tombstone entry wherever the program tracks them.
10. **Changeset + CHANGELOG** on `@anvilkit/canvas-core` (patch — TSDoc and a warning message only; no type or runtime break). `check:api-snapshot` will move for the TSDoc.

**Acceptance, restated:** after `cp4-007` the field is explicitly deprecated with a migration path and a named removal version — not functional, not dead, no third state. A document carrying `maskAssetId` parses, round-trips, keeps its asset alive through the invariant checker, survives a cross-document paste, and exports with a warning that tells the truth about where masking actually lives.

**Effort:** 0.5d (the deprecate branch), not 1d.

**Date:** Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)**

**If rejected** (owner chooses to implement alpha masking): `cp4-007` takes the implement branch and grows well past 1d — it needs an SVG `<mask>` emitter, a Konva `cache()` + `destination-in` path, an inspector control and a tool to write the field (none exists), alpha-mask fixtures in `cp4-005`, and a `canvas-bench` run on a reference environment to clear R-3. Reinstate `cp4-002`'s `<mask>` deliverable and `cp4-003`'s alpha deliverable, both voided by decision 2.

---

## Decision 4 — Elements panel restructuring (user-visible breaking change)

**Gates:** `cp3-003`, `cp3-009` · **Recorded here per** `docs/tasks/README.md:214`

### Verified current structure

- **`ElementsPanel`** resolves `toolDescriptorsFromRegistry(ctx.toolRegistry)` into buttons and filters by localized label, rendering a `role="listbox"` 3-column grid with `data-testid="elements-tool-<id>"` (`canvas-editor/src/panels/ElementsPanel.tsx:47-70,88-118`). Its own doc comment calls it *"the new home for the drawing tools"* (`:27-33`).
- **`ToolStrip`** resolves `effectiveToolDescriptors(ctx.toolRegistry, t)` (`workspace/toolstrip/ToolStrip.tsx:109-112`), which calls **the same** `toolDescriptorsFromRegistry` (`workspace/toolstrip/effective-tools.ts:66`). It renders a `role="toolbar"` floating rail with `data-testid="tool-strip-<id>"` (`:150,170`) and an overflow menu with `tool-strip-more-<id>` (`:218`).
- **Both surfaces are live simultaneously today.** `ToolStrip` is mounted by `CanvasWorkspace` (`workspace/layout/CanvasWorkspace.tsx:299`); `ElementsPanel` is registered as a workspace panel (`workspace/panel-registry.tsx:141`).
- 14 built-in tool ids (`stores/tool-store.ts:10-24`); the TSDoc above them still says "nine canvas tools" (`:4`) — stale, worth a drive-by fix in `cp3-009`.

This **confirms PLAN-0035 §8 #4 and `cp3-009`'s "deletion, not a port" framing**: the same registry already feeds both surfaces, so no tool becomes unreachable at any point during the migration.

### Answer

**Proceed, with three conditions.**

**Rationale (one line):** the ToolStrip already renders the identical effective registry and is already mounted, so the restructuring removes a duplicate surface rather than relocating a capability — but it breaks a published export and 9 spec files, so it must land as an announced break, not a refactor.

**Condition 1 — it is a published API break, not just a UI change.** `ElementsPanel` and `ElementsPanelProps` are public exports of `@anvilkit/canvas-editor` (`canvas-editor/src/index.ts:144-146`). `cp3-003` must ship a changeset marking the break, and must decide deliberately what happens to `ElementsPanelProps.tools` — the "override the list entirely" escape hatch (`ElementsPanel.tsx:18-24`). Keep it with a new meaning, or remove it; do not silently repurpose it.

**Condition 2 — state the extension-tool regression.** The panel renders built-ins and extension-registered tools in one flat grid (`ElementsPanel.tsx:58`). The ToolStrip rail is `descriptors.filter((d) => d.builtin)` and pushes extension tools into a "More tools" dropdown (`ToolStrip.tsx:142-145,192-240`). So extension tools lose a first-class surface. `cp3-009`'s deliverable *"every drawing tool reachable from the ToolStrip, including the ones only the panel surfaced"* is satisfied by the overflow, but this is a real discoverability regression for extension authors and belongs in the changelog rather than in a reviewer's head. Hosts that want an extension tool promoted into the rail can already do it with `<CanvasWorkspace toolStrip={{ items }}>` (`ToolStrip.tsx:60-68`) — document that as the mitigation.

**Condition 3 — the verification set includes the docs E2E job.** `elements-tool-*`/`elements-panel` testids are asserted in **9 spec files**, and one of them is outside `apps/studio`:

| Spec | Repo area |
| --- | --- |
| `apps/studio/e2e/canvas/editor-core.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/keyboard-shortcuts.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/clipboard.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/layer-tree.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/export-options.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/puck-bridge.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/save-and-lock.spec.ts` | `studio-e2e` |
| `apps/studio/e2e/canvas/ai-perf.spec.ts` | `studio-e2e` |
| `apps/docs/tests/playground-canvas.spec.ts` | **`docs` job — a separate CI gate** |

Every one of these uses the panel purely as a tool picker, so the migration is a selector swap from `elements-tool-<id>` to `tool-strip-<id>` (or `tool-strip-more-<id>` for extension tools), not a behavioural rewrite. `cp3-009`'s "no spec skipped, `.fixme`'d or weakened" acceptance criterion stands, and its verification must run the docs E2E job as well as `studio-e2e`.

**Executed by:** `cp3-009` (the move and the spec updates); `cp3-003` carries condition 1.

**Date:** Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)**

**If rejected** (keep the drawing tools in the Elements panel): `cp3-003` must build the content browser *around* the existing tool grid rather than replacing it, `cp3-009` is deleted, PLAN-0035 §9 R-8 is retired, and the duplicate tool surface becomes permanent — every future tool has to be verified in two places.

---

## Consequences

- **Decision 1 re-scopes P4 without deleting a task.** `cp4-004` becomes "extend and surface the existing image-well interaction", not "build a masking interaction". Its `beginCrop` reuse and drag-onto-shape deliverables are already satisfied for frames.
- **Decision 2 changes what three P4 tasks build.** `cp4-001` resolves a frame clip shape rather than an image mask; `cp4-002` loses its `<mask>` emission and warning-retirement deliverables; `cp4-003` loses its alpha-mask deliverable; `cp4-005` swaps its alpha fixture for one fixture per shape kind.
- **Decision 3 puts `cp4-007` on the deprecate branch** at 0.5d, with a ten-item instruction list that keeps all six live consumers wired and changes only TSDoc, one warning message, one header comment, and the removal schedule.
- **Decision 4 adds a changeset requirement to `cp3-003`** and a docs-E2E requirement plus a changelog note to `cp3-009`.
- **`IMAGE_MASK_UNSUPPORTED` survives this program.** Decisions 2 and 3 together mean the code is never retired: shape masks never raise it, and the field that does raise it is deprecated rather than implemented. PLAN-0035 §5 P4's `cp4-002` row ("retire `IMAGE_MASK_UNSUPPORTED`") is superseded by this ADR.
- **All four decisions carry an owner accept as of 2026-08-07**, so `cp0-004` is complete and every gating task is unblocked: P4 in full, plus `cp3-003` and `cp3-009`.

## Verification record

Every location re-opened against the working tree on 2026-08-07.

| Claim | Citation | Result |
| --- | --- | --- |
| IR-node `maskAssetId` declaration | `canvas/core/src/ir/types.ts:750` | ✓ |
| `FramePlaceholderKind` / `FramePlaceholder` | `canvas/core/src/ir/types.ts:466-484` | ✓ (task file cited `:467`) |
| `CanvasFrameNode` incl. `clip` | `canvas/core/src/ir/types.ts:492-512` (`clip` at `:496`) | ✓ (task file cited `:493`) |
| `CanvasContainerNode` union | `canvas/core/src/ir/types.ts:520` | ✓ |
| `CanvasNodeKind` (16 kinds) | `canvas/core/src/ir/types.ts:40-56` | ✓ |
| `IMAGE_MASK_UNSUPPORTED` in the warning union | `canvas/core/src/serialize/svg.ts:286` | ✓ |
| No `FRAME_MASK_UNSUPPORTED`, and why | `canvas/core/src/serialize/svg.ts:291-299` | ✓ |
| `IMAGE_MASK_UNSUPPORTED` raise site | `canvas/core/src/serialize/svg.ts:1991-1998` (code at `:1994`) | ✓ |
| Serializer mask rationale | `canvas/core/src/serialize/svg.ts:97-103` | ⚠ task file cited `:97-102`; the sentence ends on `:103` |
| Frame `clip` is lossless, no warning | `canvas/core/src/serialize/svg.ts:104-107` | ✓ |
| `emitFrame` `<clipPath>` | `canvas/core/src/serialize/svg.ts:1853-1867` | ✓ |
| `frameBoxAttrs` / `frameBoxElement` | `canvas/core/src/serialize/svg.ts:1818-1839` | ✓ |
| `roundedRectPath`, `emitEllipse`, `emitPolygon`, `emitStar` | `canvas/core/src/serialize/svg.ts:836,899,922,936` | ✓ |
| Frame placeholder fallback fill | `canvas/core/src/serialize/svg.ts:1767-1773` | ✓ |
| Rich-text `clip` reuses the same mechanism | `canvas/core/src/serialize/svg.ts:1262-1296` | ✓ |
| `resolveNodeEffects` — the ONE-resolver precedent | `canvas/core/src/ir/effects.ts:9-19` | ✓ |
| Polygon/star vertex maths | `canvas/core/src/geometry/polygon.ts:27,54` | ✓ |
| Builder option + spread | `canvas/core/src/ir/builders.ts:469,488-490` | ✓ |
| Zod field inside `looseObject` | `canvas/core/src/ir/validators.ts:551,559` | ✓ |
| Reference-preservation invariant reads it | `canvas/core/src/ir/invariants.ts:68-69` | ✓ |
| Cross-document paste re-key | `canvas/core/src/clipboard/payload.ts:264,309-312,314` | ✓ (a **fifth/sixth** consumer beyond PLAN-0035 §6's "four") |
| Clipboard asset-ref collection | `canvas/editor/src/actions/clipboard-actions.ts:113` | ✓ |
| Warning test fixture | `canvas/core/src/serialize/__tests__/svg.test.ts:1042-1054` | ✓ |
| Zero `maskAssetId` in the Konva renderer | `canvas/editor/src/stage/CanvasNodeRenderer.tsx` | ✓ zero occurrences |
| `frameClipProps` — rect/rounded only | `canvas/editor/src/stage/CanvasNodeRenderer.tsx:251-276` | ✓ |
| Frame renderer + placeholder chrome | `canvas/editor/src/stage/CanvasNodeRenderer.tsx:279-284,309-423` | ✓ |
| `blendMode` → `globalCompositeOperation` | `canvas/editor/src/stage/CanvasNodeRenderer.tsx:124` | ✓ (task cited `:122-124`) |
| Image-well actions | `canvas/editor/src/selection/frame-image-actions.ts:20,25,49,89-120,140` | ✓ |
| Drop-target resolution | `canvas/editor/src/workspace/uploads/drop-target.ts:24-26,42-73` | ✓ |
| `beginCrop` import in the inspector | `canvas/editor/src/panels/inspector/media-sections.tsx:25` | ✓ |
| Image-well inspector controls | `canvas/editor/src/panels/inspector/media-sections.tsx:495-536,537-584` | ✓ |
| `ElementsPanel` registry mapping + testids | `canvas/editor/src/panels/ElementsPanel.tsx:47-70,74,102` | ✓ |
| `ElementsPanel` is a public export | `canvas/editor/src/index.ts:144-146` | ✓ |
| `ToolStrip` reads the same registry | `canvas/editor/src/workspace/toolstrip/ToolStrip.tsx:109-112`; `effective-tools.ts:61-66` | ✓ |
| ToolStrip rail vs overflow split | `canvas/editor/src/workspace/toolstrip/ToolStrip.tsx:142-145,170,218` | ✓ |
| ToolStrip mounted by the workspace | `canvas/editor/src/workspace/layout/CanvasWorkspace.tsx:299` | ✓ |
| ElementsPanel registered as a panel | `canvas/editor/src/workspace/panel-registry.tsx:141` | ✓ |
| 14 built-in tool ids | `canvas/editor/src/stores/tool-store.ts:10-24` | ✓ (the TSDoc at `:4` still says "nine" — stale) |
| `hasImagePicker` gate | `canvas/editor/src/CanvasStudio.tsx:1278` | ✓ |
| AI-request `maskAssetId` (out of scope) | `canvas/core/src/ai-contracts.ts:22,49,68`; `apps/studio/lib/ai-image/replicate-image-provider.ts:96,113`; `apps/studio/app/api/canvas/ai/inpaint/route.ts:13` | ✓ |
| Gap analysis row `D-6` | `docs/analysis/0022-canvas-vs-canva-express-gap-0806-1311.md:106` | ⚠ it cites `types.ts:729`, which is the `CanvasImageNode` interface opening; the field is at `:750` |
| Elements-panel decision recorded here | `docs/tasks/README.md:214` | ✓ |

**Drift found:** two off-by-a-few line citations (both still resolve to the right construct), and PLAN-0035 §6's "four live consumers" of the IR field undercounts — there are **six**, the two clipboard paths being the ones it omits. No citation failed to resolve.

## References

- `docs/plans/0035-canvas-core-parity-phased-execution-0806-1854.md` §5 P0, §5 P4, §6, §9 R-3, R-4, R-8
- `docs/tasks/cp0-004-adr-masking-design-decision.md` (this ADR's task)
- `docs/tasks/cp4-001-resolve-node-mask.md` … `docs/tasks/cp4-007-maskassetid-disposition.md`
- `docs/tasks/cp3-003-elements-panel-rebuild.md`, `docs/tasks/cp3-009-toolstrip-migration-and-e2e.md`
- `docs/analysis/0022-canvas-vs-canva-express-gap-0806-1311.md` row `D-6`
- `docs/adr/0007-canonical-editor-decisions.md` (the decision-record format this ADR follows)

## Puck contract

Documentation and decision only. Canvas masking is internal to Canvas IR, which is a separate document model from Puck `Data`; nothing here defines a Puck `Config`, `Data`, root prop, component prop, or render path. The Puck-side integration (`DesignBlock`, `plugin-canvas-studio`) is untouched. Decision 4 changes a `@anvilkit/canvas-editor` React surface only. No parallel IR, root sidecar, duplicated render pipeline, or Puck internal is introduced — and decision 2 is chosen specifically to avoid creating a second clipping pipeline inside Canvas.
