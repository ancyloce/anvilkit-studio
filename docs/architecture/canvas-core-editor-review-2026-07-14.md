# Canvas Core / Editor Architecture Review — 2026-07-14

Scope: `packages/capabilities/canvas/core` (`@anvilkit/canvas-core`) and
`packages/capabilities/canvas/editor` (`@anvilkit/canvas-editor`), both
independent git submodules with their own package.json/publish lifecycle.

## 1. Current Architecture

### Core (`@anvilkit/canvas-core`) — React/Konva-free

Layered per `check-layering.mjs` (a real, enforced gate):

```
clock(0) < ir(1) < {ai-contracts,text-contracts,geometry,export,comment-contracts}(2)
  < commands(3) < {extensions,templates,brand}(4) < {serialize,ai-design-contracts}(5) < index.ts(6)
```

- **IR + schema** (`ir/types.ts`, `ir/validators.ts`): `CanvasIR` is
  `{ version: "2", pages: CanvasPage[] (min 1), assets, metadata, ... }`. Zod
  schemas use `z.looseObject` everywhere (preserve unknown keys — forward
  compat for a versioned/collaborative wire format) and a `discriminatedUnion`
  on `type` for `CanvasNode`. `CanvasIRSchema.pages` is `.min(1)` — the "at
  least one page" invariant is already enforced *at the schema layer*.
- **Migrations** (`ir/migrations.ts`): a small from→to registry, seeded with
  v1→v2 (pure version-tag bump). `migrateCanvasIR` reads `raw.version`,
  rejects unsupported versions, migrates, then parses.
- **Walkers** (`ir/walkers.ts`): `walk`/`findNode`/`parentOf`/`pageOf`. What
  counts as a "container" (recursed into) is a **static** `Set(["group",
  "frame"])`, documented as intentional: pure functions with no runtime
  handle, and a static set gives real type narrowing. A parity test asserts
  this set equals the built-in kind defs flagged `isContainer`.
- **Mutations** (`ir/mutations.ts`): single-pass immutable
  insert/remove/update/move/reorder/replaceChildrenInParent, all built on
  `isContainerNode` from walkers — i.e. the same static set.
- **Commands** (`commands/runtime.ts`, `types.ts`, `transaction.ts`,
  `change-events.ts`): `applyCommand(ir, cmd, opts) -> { ir, inverse }` is a
  big switch over a closed `CanvasCommand` union. `applyCommands` wraps many
  commands in a `batch` (all-or-nothing) and *additionally* derives
  `CanvasChangeRecord[]` via `commandToChangeRecord`. `CommandApplyResult`
  hard-codes `inverse: CanvasCommand`.
- **Extension runtime** (`extensions/*.ts`): `createCanvasRuntime(extensions)`
  builds a `CanvasNodeKindRegistry` (seeded with built-ins, unshadowable),
  `CanvasCommandRegistry`, `CanvasMigrationRegistry`, and — only when at least
  one extension registers a node kind — **rebuilds** `nodeSchema`/`irSchema`
  from scratch in `buildExtendedSchemas` (a hand-duplicated copy of the
  page/IR shape, not a re-export of the static one). `CanvasNodeKindDefinition`
  carries an `isContainer` flag, but nothing in `ir/walkers.ts` or
  `ir/mutations.ts` consults the registry — only `serialize/svg.ts` does
  (`ctx.options.nodeKinds`, for leaf `toSvg` fallback).
- **Serialize** (`serialize/svg.ts`, `pdf.ts`): SVG serialization is
  runtime-aware for unknown leaf kinds (`ctx.options.nodeKinds?.get(type)?.toSvg`)
  and has **explicit built-in cases for every kind including `video`/`audio`**
  (`emitVideo`/`emitAudio`), each reporting a fidelity warning. PDF wraps SVG.

### Editor (`@anvilkit/canvas-editor`) — React + Zustand + Konva

- **Stores** (`stores/*.ts`): one zustand vanilla store per concern —
  `sceneStore` (the live `CanvasIR`), `historyStore` (past/future inverse
  commands), `pagesStore` (activePageId), `selectionStore`, `focusStore`,
  `draftStore`, `editingStore`, `cropStore`, `penStore`, `pathEditStore`,
  `guidesStore`, `aiJobStore`, `viewportStore`, `toolStore`. All created fresh
  per `<CanvasStudio>` mount in `useEditorStores`.
- **`historyStore`** (`stores/history-store.ts`) calls `applyCommand` **imported
  directly from `@anvilkit/canvas-core`** — the static built-ins-only function,
  not an injected runtime.
- **Commit pipeline** (`CanvasStudio.tsx` `useCommitPipeline`): `commit(cmd)` →
  `historyStore.commit(sceneStore.ir, cmd)` → `sceneStore.setIR(next)` →
  `onChange`/`onChanges`. `commitBatch` mirrors it for `CanvasCommand[]`.
- **Context** (`context/canvas-studio-context.tsx`): a two-tier context
  (`CanvasStudioStableContext` = store handles/callbacks that never change
  identity; `CanvasStudioContext` = stable + live `ir`/`activePageId`/`stage`).
  No `runtime` field exists on either.
- **Collaboration** (`collab/binding.ts`, `encode.ts`): `createCanvasYjsBinding`
  stores the **entire `CanvasIR` as one JSON string** under a single Y.Map key
  (`CANVAS_IR_KEY`), sorted-key-stringified for byte-stable LWW comparison.
  `decodeCanvasIR` calls `CanvasIRSchema.parse` directly (no migration, no
  runtime). On join or remote change, `applyRemote(ir)` calls **only**
  `sceneStore.getState().setIR(ir)` — no other store is touched.
- **Public entry points**: root `index.ts` is the stable surface
  (`CanvasStudio`, context hooks, panels, page actions, export, brand,
  templates). `./internal` and other deep subpaths are the unstable surface.
  `./collab` is a separate entry (optional `yjs`/`y-protocols` peers).

### Dependency direction

`canvas-editor` depends on `canvas-core` (`"@anvilkit/canvas-core": "workspace:*"`
in `dependencies`, not `devDependencies`) — one-directional, as intended.
`canvas-core` has zero React/Konva/editor imports (`check:react-free-runtime`
gate). Both packages' **tooling** devDependencies
(`@anvilkit/biome-config`/`typescript-config`/`vitest-config`) are also
`workspace:*`.

## 2. Issue Verification

| # | Status | Evidence |
|---|--------|----------|
| P0-1 | **Confirmed defect** | `commands/transaction.ts:70` — `commandToChangeRecord(cmd, ir, ...)` inside `.map((cmd, index) => ...)` closes over the **outer, pre-transaction** `ir`, never the per-step result. For `[node.create, node.move]`, the second record's `pageId` resolution (`resolveChangePageId` → `pageOf(ir, nodeId)`) runs against an `ir` that doesn't contain the just-created node yet — this doesn't just mis-tag the record, it **throws** ("could not resolve a containing page"). Root cause: the `records` map is independent of the `applyCommand`/`applyBatch` fold that actually threads `working` forward. Layer: Core (`commands/transaction.ts`). Compat risk: low — `TransactionApplyResult.records` shape is unchanged, only correctness improves. |
| P0-2 | **Confirmed defect** | `commands/runtime.ts` `applyPageDelete` (line 615) has zero guard on `ir.pages.length`. `ir/validators.ts` `CanvasIRSchema` already declares `pages: z.array(CanvasPageSchema).min(1)`, but commands never re-validate against that schema, so `applyCommand`/`applyCommands` can silently produce a 0-page IR. The only existing guard is in the Editor's `pages/page-actions.ts` `deletePage` helper (`if (ir.pages.length <= 1) return;` — a silent no-op, not an error, and bypassable by calling `applyCommand`/`runtime.apply` directly, which every collab/replay/custom-host path does). Layer: Core (`commands/runtime.ts`), the Editor guard needs to defer to it. Compat risk: low (new failure mode where an invalid op used to silently corrupt state or no-op). |
| P0-3 | **Confirmed defect** | `extensions/canvas-runtime.ts` `buildExtendedSchemas` (lines 168-222) hand-rebuilds `page` as `z.looseObject({ id, name, size, background, root })` — **omitting `variantSource` and `animation`**, both present on the static `CanvasPageSchema` (`ir/validators.ts:489-497`). Because both are `looseObject`, the extended-runtime path doesn't reject or strip these fields — it just never *validates* their shape once any custom node kind is registered. This is real drift, not yet data loss. Root cause: no shared shape constant for `CanvasPage` (unlike `CanvasFrameNodeShape`, which *is* factored out and reused by both paths). Layer: Core. Compat risk: low — tightening validation on an already-loose schema. |
| P0-4 | **Confirmed architectural gap** | `commands/types.ts`: `CommandApplyResult { ir: CanvasIR; inverse: CanvasCommand }` — `inverse` is the closed built-in union. `extensions/command-registry.ts`: `CanvasCommandHandler<C>.apply` returns exactly `CommandApplyResult`, so a custom command whose natural inverse is itself a custom command type has no way to satisfy the return type without an unsafe cast (`as unknown as CanvasCommand`). `CanvasRuntime.apply` (`canvas-runtime.ts`) has the same fixed return type. Layer: Core (`commands/types.ts`, `extensions/command-registry.ts`, `extensions/canvas-runtime.ts`). Compat risk: low if done via a defaulted generic (existing built-in-only call sites need no changes). |
| P0-5 | **Confirmed architectural gap** | `ir/walkers.ts` `CONTAINER_KINDS` is a hard-coded `Set(["group","frame"])`; `ir/mutations.ts`'s `isContainerNode` import is the same static function. `CanvasNodeKindDefinition.isContainer` (`extensions/node-kind-registry.ts`) is accepted at registration time with **no consumer** in walkers/mutations — only `serialize/svg.ts` consults the registry, and only for leaf `toSvg` fallback. So a host that registers `{ kind: "sticky-note", isContainer: true }` today gets silent breakage: `findNode`/`parentOf`/`insertNode`/`removeNode`/`updateNode` never recurse into its `children`, so nested content is invisible to every command. Layer: Core. Given "do not leave a misleading partially-supported state," and that full runtime-aware traversal is a rewrite of every walker/mutation entry point (materially larger than the rest of this review combined), the chosen resolution is to **explicitly reject** `isContainer: true` at `register()` time (`CanvasExtensionError` with a new code) until a future extension seam exists — see §6. |
| P0-6 | **Confirmed gap** | There is no semantic-invariant validator anywhere in Core — only Zod structural schemas (shape/type checks) and command-local guards (e.g. `node.group` duplicate-childId check). Nothing detects duplicate node ids across the whole IR (including across pages), asset-id/key mismatches (`ir.assets[key].id !== key`), dangling `assetId` references, or a page whose `root.id` collides with another page's `root.id`. `applyCommand`/`applyCommands` never re-validate the *resulting* IR, so a caller combining a valid command with a hand-crafted `node.create` (an arbitrary `CanvasNode`) can create duplicate ids the schema alone won't catch (a Zod `id: string` field has no document-wide uniqueness concept). Layer: Core, new module. |
| P0-7 | **Confirmed defect** | `stores/history-store.ts` imports `applyCommand` from `@anvilkit/canvas-core` at module scope and calls it in `commit`/`commitBatch`/`commitCoalesced`/`undo`/`redo` — five call sites, all hard-wired to the built-ins-only function. `CanvasStudioProps` (`CanvasStudio.tsx`) has no `runtime` field; `createHistoryStore()` (called in `useEditorStores`) takes no runtime option. A host that built a `CanvasRuntime` with `createCanvasRuntime([myExtension])` (for custom node kinds/commands) has no way to get the Editor's undo stack to use it — custom commands committed via `ctx.commit(customCmd)` would hit `applyCommand`'s `switch` and fall through with no matching case (a TS type error at the call site today, since `commit: (cmd: CanvasCommand) => CanvasIR` is typed to the closed union — so this is currently unreachable for a *type-safe* custom command, but is exactly the gap P0-4 needs P0-7 to close). Layer: Editor. |
| P0-8 | **Confirmed defect** | `collab/encode.ts` `decodeCanvasIR` is `JSON.parse` → `CanvasIRSchema.parse` — no `migrateCanvasIR`, no runtime `irSchema`. A peer running an older document version (`version: "1"`) is **rejected outright** by a newer build (Zod's `literal(CANVAS_IR_VERSION)` fails), even though Core ships a v1→v2 migration specifically for this. A peer using a runtime with custom node kinds has its custom nodes rejected by the closed built-in `CanvasNodeSchema` discriminated union (an unrecognized `type` literal fails the union, and unlike an unknown *field* — which `looseObject` tolerates — an unknown *node kind* is a hard schema-union miss). Layer: Editor (`collab/encode.ts`, `collab/binding.ts`). |
| P0-9 | **Confirmed gap** | `collab/binding.ts` `applyRemote` calls exactly `sceneStore.getState().setIR(ir)`. Enumerated other stores untouched on a remote replace: `historyStore` (past/future may reference node ids no longer in the new IR — an `undo()` after a remote replace can throw `CanvasCommandError("node-not-found")` from a stale inverse, or worse, silently apply against unrelated nodes that happen to share an id), `pagesStore.activePageId` (may point at a page the remote IR no longer has — `CanvasStudio.tsx` already has an explicit `if (!activePage) return <div data-testid="canvas-empty">...` fallback, i.e. this exact failure mode is already anticipated but not prevented), `selectionStore`/`focusStore` (stale node ids), `draftStore`/`editingStore`/`cropStore`/`penStore`/`pathEditStore` (mid-gesture transient state referencing pre-replace nodes), `guidesStore` (stale alignment guides). No existing abstraction coordinates these — `sceneStore` is deliberately the only "collab seam" today. Layer: Editor, new coordinating operation (not a full document-controller rewrite — see §6). |
| P0-10 | **Confirmed, intentional prototype, under-documented** | `collab/binding.ts`'s own doc comment already says *"Encoding is whole-document JSON-blob last-writer-wins... architectural only: no UI is wired here"* — so the code is honest in its immediate vicinity. But this caveat is **not** surfaced in `editor/README.md`'s "Collaboration" bullet ("optional Yjs binding and remote cursor/selection presence"), which reads as a feature description with no consistency-model caveat, and the public `./collab` entry's exported types carry no such warning either. No adapter boundary exists to let a future fine-grained implementation swap in without changing `SceneStoreApi`'s shape. Layer: Editor, docs + a thin interface extraction. |
| P1-1 | **Confirmed defect** | `stage/CanvasNodeRenderer.tsx`'s exhaustive `switch (node.type)` has cases for every built-in kind **except `video`/`audio`**, which fall to `default: return <CanvasCustomNodeRenderer node={node} />`. That component looks up `studio?.kindRenderers?.[type]` — a table only *extension* renderers populate; nothing registers built-in kinds there. Result: `video`/`audio` nodes render **nothing** on the Konva stage (return `null`), while Core's SVG serializer (`serialize/svg.ts`) already has explicit, warning-emitting `emitVideo`/`emitAudio` cases. This is precisely "a built-in node silently disappears." Layer: Editor (`stage/CanvasNodeRenderer.tsx`). |
| P1-2 | **Confirmed gap** | `core/package.json` has `check:layering` (`scripts/check-layering.mjs`, a real self-tested gate wired into `check:all`); `editor/package.json` has no equivalent script and no `check:layering` entry in `check:all`. |
| P1-3 | **Confirmed drift** | `editor/README.md`'s Collaboration bullet omits the LWW caveat (see P0-10); neither README documents `runtime` injection (didn't exist until this review); README examples don't mention that `video`/`audio` editor rendering was previously a silent no-op. |
| P1-4 | **Confirmed, needs explicit statement** | Both packages declare `workspace:*` for `@anvilkit/canvas-core` (editor→core) and all three tooling devDependencies. `docs/architecture/repository-structure.md`'s Submodule Policy section already establishes the actual model (independently-versioned, independently-publishable submodules, developed inside the parent workspace, "every new plugin must be independently runnable" as a **forward-looking** requirement — not retroactive). Neither package's own README states this. A literal `git clone` of just the submodule + `pnpm install` fails today (no lockfile/registry entry resolves `workspace:*`) — this is expected under the documented model, but undocumented locally. |

None of the ten P0 issues are "already fixed" or "not reproducible" — all ten are real, verified against current source at the line level above.

## 3. Invariants (confirmed against current code)

- A `CanvasIR` must contain ≥1 page — enforced by `CanvasIRSchema.pages.min(1)` at the schema layer only; **not** enforced by `applyPageDelete` (P0-2 fixes this).
- Node ids must be unique within a page (relied upon by `findNode`'s first-match walk) and, per the product model, across the whole document — currently **unenforced** (P0-6).
- Commands must never return an IR that violates the current schema — true for every built-in command's *shape* today, but not proactively checked (P0-2 is the one case where it's actually violated).
- Batch commands are atomic — true: `applyBatch` folds over a local `working` IR and only returns on full success; a throw from any sub-command propagates before `applyCommands`/`historyStore` ever sees a result.
- Each inverse restores exact prior state — true for all built-in commands (verified by reading every `apply*` function: each captures the pre-mutation value before computing `next`).
- Change records must derive from correct per-command pre-state — **currently false** (P0-1).
- Persisted/remote documents must migrate before validation — true for `migrateCanvasIR`/`runtime.migrate` call sites; **false** for `collab/encode.ts`'s `decodeCanvasIR` (P0-8).
- Custom nodes/commands must use the same runtime across decode/edit/history/serialize — true for `serialize/svg.ts`; **false** for the Editor's history pipeline (P0-7) and collab decode (P0-8).
- Replacing a document snapshot must reconcile editor state — **currently false** (P0-9).
- Remote changes must not leave stale undo entries or stale page/selection state — **currently false** (P0-9).
- Built-in node kinds must have an explicit editor/export capability policy — true for SVG/PDF export; **false** for the Konva editor renderer prior to this review (P1-1).

## 4. Implementation Plan (dependency order)

1. **Core, P0-1** — `commands/transaction.ts`: thread the per-step IR through the `records` map (fold alongside `applyBatch`'s own loop rather than re-deriving separately). Tests: create→update, create→move, delete-related records, multi-page batch.
2. **Core, P0-2** — `commands/runtime.ts` `applyPageDelete`: reject when `ir.pages.length <= 1` with a new `CanvasCommandError` (code `"invariant-violated"`, message naming the page). Editor's `deletePage` helper keeps its early return (still useful — avoids a round-trip through a throwing commit) but no longer the *only* guard. Tests: direct `applyCommand`, `applyCommands` (batch containing the doomed delete plus other ops — must roll back all of it), undo/redo (deleting down to 1 page, then re-adding, is unaffected), Editor helper.
3. **Core, P0-3** — `ir/validators.ts`: extract `CanvasPageShape` (mirroring the existing `CanvasFrameNodeShape` pattern) and an IR-shape builder; `canvas-runtime.ts` `buildExtendedSchemas` consumes them instead of hand-rewriting. Parity test: for every field on `CanvasPageSchema`/`CanvasIRSchema`, assert the extended-runtime schema accepts/validates it identically.
4. **Core, P0-4** — widen `CommandApplyResult`/`CanvasCommandHandler`/`CanvasRuntime.apply` with a defaulted generic inverse type; no call-site changes for built-in-only consumers. Compile-time test (`.test-d` style assertion or a dedicated typecheck fixture) plus a runtime test registering a custom command whose inverse is itself custom.
5. **Core, P0-5** — `node-kind-registry.ts` `register()`: throw `CanvasExtensionError("container-kind-unsupported", ...)` when `def.isContainer` is true. Update `CanvasNodeKindDefinition.isContainer`'s doc comment to state the restriction and point at this decision. Test: registering a container extension kind throws with the right code.
6. **Core, P0-6** — new `ir/invariants.ts` (rank alongside `ir/validators.ts`, i.e. layer 1): `validateCanvasIRInvariants(ir): CanvasInvariantIssue[]` — duplicate ids (whole-document), asset key/id mismatch, dangling asset refs, page-root id collisions, excessive depth (reuse `MAX_TREE_DEPTH`). NOT wired into every `applyCommand` call (would make every command O(n)); exposed as an explicit opt-in the host/tests call after a batch, at decode time, or in CI/test fixtures. Tests: one per invariant, adversarial cases.
7. **Editor, P0-7** — `history-store.ts`: accept an optional `apply?: (ir, cmd, opts) => CommandApplyResult` (defaults to core's `applyCommand`) via `CreateHistoryStoreOptions`; `CanvasStudioProps` gains `runtime?: CanvasRuntime`, threaded into `useEditorStores`/`createHistoryStore` as `apply: runtime?.apply ?? applyCommand`. Commit/commitBatch/undo/redo already route through `historyStore`, so this is the single seam. Tests: custom command commit/batch/undo/redo through an injected runtime.
8. **Editor, P0-8** — `collab/encode.ts` `decodeCanvasIR(raw, runtime?)`: use `(runtime ?? defaultRuntime).migrate(parsed)` — a lazily-constructed default `createCanvasRuntime()` when no runtime is passed, so the zero-config path still migrates old versions instead of only validating current-version, built-in-only documents. `binding.ts` gains an optional `runtime` option threaded to `decodeCanvasIR`/`readCurrent`. Tests: v1 payload decodes, custom-kind payload decodes with a matching runtime, malformed payload still throws-and-is-caught (never escapes the observer).
9. **Editor, P0-9** — a new `collab/replace-document.ts` (or similar) coordinating function taking the full store bundle + next `ir` + a `source` tag; resets `historyStore`, reconciles `pagesStore.activePageId` (falls back to `ir.pages[0].id` if the current one is gone), clears `selectionStore`/`focusStore`/`draftStore`/`editingStore`/`cropStore`/`penStore`/`pathEditStore`/`guidesStore`. `binding.ts`'s `applyRemote` calls it instead of bare `setIR`. Tests: remote replace after local edits clears history/selection, active page falls back correctly, mid-drag state is cleared.
10. **Editor, P0-10** — expand `binding.ts`'s doc comment + `editor/README.md` Collaboration section with the explicit LWW caveat; extract a minimal `CanvasCollabAdapter` interface (`current()`/`subscribe()`/`push()`/`destroy()`) that `createCanvasYjsBinding` already structurally satisfies, so a future fine-grained implementation is a drop-in. No CRDT rewrite.
11. **Editor, P1-1** — add `CanvasVideoNodeRenderer`/`CanvasAudioNodeRenderer` placeholder components (mirroring the existing `CanvasAiPlaceholderNodeRenderer` visual pattern: bordered box + label, using `poster` asset for video when present) and wire into the `switch`. Capability-matrix doc as a table in this file's follow-up section.
12. **Editor, P1-2** — new `scripts/check-layering.mjs` derived from the Editor's actual top-level `src/` layout, wired into `check:all`.
13. **Both, P1-3** — README updates reflecting 1-11.
14. **Both, P1-4** — README "Development" note on the workspace/submodule model.

Everything above preserves existing public API shapes except strictly additive changes (new optional props/params, new error codes, new exported types).

---

# Final Report

## 1. Verified Findings

| # | Verdict |
|---|---|
| P0-1 | **Confirmed, fixed.** `applyCommands` derived every change record from the original `ir`, not the per-step IR — a create-then-move transaction threw instead of resolving `pageId`. |
| P0-2 | **Confirmed, fixed.** `applyPageDelete` had no last-page guard; the Editor's `deletePage` helper was the *only* guard (a silent no-op, not an error, and bypassable). |
| P0-3 | **Confirmed, fixed.** `buildExtendedSchemas` hand-duplicated the page/IR shape and omitted `variantSource`/`animation`. |
| P0-4 | **Confirmed, fixed.** `CommandApplyResult`/`CanvasCommandHandler` forced `inverse: CanvasCommand`, requiring an unsafe cast (`as never`) for a genuinely custom inverse — removed the cast from the codebase's own test that exhibited it. |
| P0-5 | **Confirmed, resolved via explicit restriction (not full support).** Walkers/mutations only ever recognized static `group`/`frame`; `isContainer: true` on an extension kind was silently accepted then silently never walked. Now rejected at `register()` with a new error code. |
| P0-6 | **Confirmed gap, closed.** No semantic-invariant layer existed; added one, deliberately NOT wired into every command (opt-in, at trust boundaries). |
| P0-7 | **Confirmed, fixed** — and a **second, deeper bug found and fixed while implementing it**: `CanvasRuntime.apply`'s `"batch"` case routed to the STATIC `applyCommand`, whose own batch recursion has no runtime awareness — a custom command nested inside a batch would silently no-op even with a runtime injected. Fixed at the Core layer. |
| P0-8 | **Confirmed, fixed.** `decodeCanvasIR` called `CanvasIRSchema.parse` directly — no migration — so an old-but-supported version, or any document with a custom node kind, was rejected outright. |
| P0-9 | **Confirmed, fixed.** Remote/joined snapshot replacement touched only `sceneStore.ir`; history/selection/focus/draft/editing/crop/pen/path-edit/guides/AI-jobs/active-page all went stale. |
| P0-10 | **Confirmed, intentional prototype, now explicit.** The code's own doc comment was already honest nearby; the public README/entry-point surface was not. Documented in code, `collab/index.ts`, and the README; added `CanvasCollabAdapter` as the future swap-in seam. No CRDT rewrite attempted (none of the required architecture exists). |
| P1-1 | **Confirmed, fixed.** `video`/`audio` fell through to the extension-fallback renderer, which resolves nothing for a built-in kind — both rendered NOTHING on the Konva stage while Core's SVG serializer already had explicit `emitVideo`/`emitAudio` cases. |
| P1-2 | **Confirmed gap, closed.** Core has `check:layering`; the Editor had none. Real directory-level cycles exist within the Editor's `brand/context/extensions/perf/render/selection/snap/stage/stores/tools` cluster (verified: no FILE-level cycle — `madge` passes — but genuine directory-level mutual references), so the new checker folds them into one domain rather than imposing a false strict order; documented why in the script. |
| P1-3 / P1-4 | **Confirmed drift, updated.** Both READMEs described `version: "1"`, an 8-kind node union, and no workspace-model statement; now reflect `version: "2"`, all 15 kinds, the new `runtime`/`replaceDocument` APIs, the LWW caveat, and the submodule/workspace development model. |

## 2. Changes Made

### `anvilkit-canvas-core`
- `commands/transaction.ts` — `applyCommands` folds per-command change-record derivation into the same pass that threads the IR forward (P0-1).
- `commands/runtime.ts` — `applyPageDelete` rejects removing a document's last page (P0-2).
- `ir/validators.ts` — extracted `CanvasPageShape`/`CanvasIRShape` (mirroring the existing `CanvasFrameNodeShape` pattern) so the static and extension-aware schemas can never drift (P0-3).
- `extensions/canvas-runtime.ts` — `buildExtendedSchemas` consumes the shared shapes (P0-3); `apply` widened to a generic `<C = CanvasCommand>` signature with one contained internal cast (P0-4); `"batch"` now recurses through the runtime's own `apply`, not the static dispatch (P0-7 discovery).
- `commands/types.ts` — `CommandApplyResult<Inverse = CanvasCommand>` generic (P0-4).
- `extensions/command-registry.ts` — `CanvasCommandHandler<C, Inverse = C | CanvasCommand>`, `CanvasCommandRegistry.register<C, Inverse>` (P0-4).
- `extensions/node-kind-registry.ts` — `register()` rejects `isContainer: true` with a new `"container-kind-unsupported"` error code (P0-5).
- `ir/invariants.ts` **(new)** — `validateCanvasIRInvariants`, `assertCanvasIRInvariants`, `CanvasIRInvariantError`, `CanvasInvariantIssue` (P0-6).
- `ir/index.ts` — barrel export for the new invariants module.
- Tests: `commands/__tests__/transaction.test.ts` (+5), `commands/__tests__/commands.test.ts` (+3), `extensions/__tests__/canvas-runtime.test.ts` (+3), `extensions/__tests__/extension-registries.test.ts` (+1 rewritten, +1 new), `ir/__tests__/ir-invariants.test.ts` **(new, 12 tests)**.

### `anvilkit-canvas-editor`
- `stores/history-store.ts` — `AnyCanvasCommand`, `CommandApplyFn`, `CreateHistoryStoreOptions.apply` (defaults to core's `applyCommand`); every dispatch site (`commit`/`commitBatch`/`commitCoalesced`/`undo`/`redo`) now goes through the injectable `apply` (P0-7).
- `CanvasStudio.tsx` — new `runtime?: CanvasRuntime` prop threaded into `useEditorStores`; `commit`/`commitBatch`/`onChange` widened to `AnyCanvasCommand`; new `useReplaceDocument` hook (P0-9).
- `context/canvas-studio-context.tsx` — `commit`/`commitBatch` widened; new `runtime`/`replaceDocument` context fields.
- `stores/replace-document.ts` **(new)** — `DocumentStores`, `DocumentSnapshotSource`, `replaceDocumentSnapshot` (P0-9).
- `stores/ai-job-store.ts` — new `reset()` method (aborts pending jobs, clears registry) (P0-9).
- `collab/encode.ts` — `decodeCanvasIR(raw, runtime?)` migrates before validating (P0-8).
- `collab/binding.ts` — `runtime`/`stores` options; join + remote-observer paths route through `replaceDocumentSnapshot` when `stores` is supplied; new `CanvasCollabAdapter` interface; expanded consistency-model doc comment (P0-8, P0-9, P0-10).
- `collab/index.ts` — re-exports the new types/function; module doc comment states the LWW caveat.
- `internal.ts` — exports `AnyCanvasCommand`/`CommandApplyFn`/the `replace-document` module.
- `stage/CanvasNodeRenderer.tsx` — `CanvasVideoNodeRenderer`/`CanvasAudioNodeRenderer` + shared `MediaPlaceholderChrome`, wired into the kind switch (P1-1).
- `scripts/check-layering.mjs` **(new)** + `package.json` `check:layering` script wired into `check:all` (P1-2).
- Tests: `stores/__tests__/history-store-runtime.test.ts` **(new, 5)**, `stores/__tests__/replace-document.test.ts` **(new, 6)**, `collab/__tests__/encode.test.ts` (+4), `collab/__tests__/binding.test.ts` (+1 integration test), `extensions/__tests__/canvas-runtime.test.ts`-equivalent coverage in `stage/__tests__/CanvasNodeRenderer.test.tsx` (+7).

### Documentation
- Both READMEs: `CanvasIR` version, full 15-kind node list, entry-point tables, command list, extension constraints, LWW collaboration caveat, `runtime`/`replaceDocument` APIs, Status + Development-model (workspace) sections. Editor README gained a built-in-node capability matrix (P1-1).

### Release gates
- New `check:layering` gate for the Editor, mirroring Core's, added to `check:all`.

## 3. Public API Changes

**Added (Core):** `ir/invariants.ts` (`validateCanvasIRInvariants`, `assertCanvasIRInvariants`, `CanvasIRInvariantError`, `CanvasInvariantIssue`, `CanvasInvariantIssueCode`); `CanvasPageShape`, `CanvasIRShape`; `CanvasExtensionErrorCode` gained `"container-kind-unsupported"`.

**Added (Editor):** `CanvasStudioProps.runtime`; `CanvasStudioContextValue.runtime`/`.replaceDocument`; `CreateHistoryStoreOptions.apply`, `AnyCanvasCommand`, `CommandApplyFn`; `stores/replace-document.ts`'s `DocumentStores`/`DocumentSnapshotSource`/`ReplaceDocumentSnapshotOptions`/`replaceDocumentSnapshot`; `AiJobState.reset`; `collab`'s `CanvasCollabAdapter`, `CreateCanvasYjsBindingOptions.runtime`/`.stores`.

**Changed (widened generics, backward-compatible for existing callers):** `CommandApplyResult<Inverse = CanvasCommand>`; `CanvasCommandHandler<C, Inverse = C | CanvasCommand>`; `CanvasCommandRegistry.register<C, Inverse>`; `CanvasRuntime.apply<C = CanvasCommand>`; Editor's `commit`/`commitBatch`/`onChange` now accept `AnyCanvasCommand` instead of the closed `CanvasCommand` union (a strict widening — every existing call site still type-checks unchanged).

**Deprecated:** none.

**Breaking:** none. `CanvasCommandError`/`CanvasExtensionError` gained new *codes*, not new required fields — existing `switch`/`if` handling on `.code` that doesn't exhaustively switch is unaffected; an exhaustive switch would need the new cases added (this is the same category of change as adding a new built-in node kind).

**Migration instructions:** none required. All changes are additive/widening.

## 4. Tests and Validation

**Commands executed (both packages, final clean pass):** `typecheck`, `lint`, `test` (vitest run), `build`, `check:all` (publint, circular, layering, react-free [core only], peer-deps, bundle-budget, api-snapshot).

**Results:**
- Core: typecheck clean · lint clean (95 files) · **728/728 tests pass** (44 files) · build OK · `check:all` OK (api-snapshot regenerated and reviewed — genuine new symbols, no unintended API drift).
- Editor: typecheck clean · lint clean (232 files) · **720/720 tests pass** (88 files) · build OK · `check:all` OK, including the new `check:layering` (451 edges, 0 violations) · api-snapshot regenerated and reviewed.

**Tests added:** 12 (Core, `ir-invariants.test.ts`) + ~13 (Core, spread across `transaction`/`commands`/`canvas-runtime`/`extension-registries`) + 5 (`history-store-runtime.test.ts`) + 6 (`replace-document.test.ts`) + 4 (`encode.test.ts`) + 1 (`binding.test.ts`) + 7 (`CanvasNodeRenderer.test.tsx`) ≈ **48 new tests**, all passing, covering every P0/P1 fix's stated test requirements (batch pre-state, last-page rejection at every layer, schema parity, custom-inverse type safety, custom-command batch/undo/redo including the nested-batch discovery, migration + runtime-aware decode, remote snapshot reconciliation, video/audio rendering in both editor and export contexts).

**Remaining failures:** none deterministic. Two DIFFERENT test files (`CanvasWorkspace.test.tsx`'s axe scan, `ExportMenu.test.tsx`'s `waitFor`) timed out once each across two full-suite parallel runs, unrelated to any file this review touched; both pass cleanly in isolation — pre-existing resource-contention flakiness under the full parallel suite, not a regression.

## 5. Remaining Limitations

- **Whole-document LWW collaboration** (P0-10) — now explicitly documented rather than fixed; a real per-node/per-field merge needs a CRDT-over-the-tree or a replicated command-log rewrite, out of scope here. `CanvasCollabAdapter` is the seam for that future work.
- **Extension container kinds are unsupported, not partially supported** (P0-5) — an intentional, documented restriction, not a limitation of this pass specifically; lifting it needs runtime-aware traversal across every walker/mutation entry point.
- **`CanvasRuntime.apply<C>()`'s static return type is `C | CanvasCommand`, not the exact registered handler's `Inverse`** — the registry is a runtime `Map`, so the dispatch façade can't statically know which handler resolves an arbitrary string `type`. The precise `Inverse` type IS available by defining/calling a `CanvasCommandHandler<C, Inverse>` directly (proven in the P0-4 tests); only the *dynamic-dispatch* call site is limited. A full fix would need a type-level command registry keyed by literal type strings — judged excessive complexity per this review's own instructions.
- **Editor inspector field coverage and the accessibility scene tree were not re-audited kind-by-kind** for the P1-1 capability matrix — flagged explicitly in the README rather than guessed at.
- **Standalone-repo constraint is documented, not resolved** (P1-4) — both packages still require the parent monorepo workspace for local development (`workspace:*` devDependencies); this matches the project's own documented Submodule Policy (retention decision, 2026-07-11), not a defect this review should "fix" by replacing `workspace:*` with published ranges.
- **README documentation pass was targeted, not exhaustive** — `brand/`, `templates/`, `ai-design-contracts.ts`, `comment-contracts.ts`, `text-contracts.ts` exist in Core's `src/` and are now listed in the entry-points table, but their APIs are not walked through in prose; a fuller docs pass is a reasonable follow-up.

## 6. Recommended Follow-Up

**Required before the next RC:**
- Decide and execute: bump the superproject's gitlinks for `packages/capabilities/canvas/{core,editor}` to the new commit SHAs (see the git-state note below) so the monorepo's tracked submodule pointers match what's actually on each submodule's `main`.
- Push the Editor submodule's 5 local-only commits (see below) if this work is meant to ship — right now Core's equivalent work is already live on its real GitHub remote but Editor's is not.

**Required before beta:**
- A fuller Editor inspector/accessibility audit against the P1-1 capability matrix (confirm `PropertyInspector`/`SceneAccessibilityTree` have explicit, non-silent behavior for every kind, especially `video`/`audio`/`rich-text`/`polygon`/`star`).
- Consider whether `CanvasRuntime.apply`'s per-call generic is worth extending to a small type-level registry (mapping literal command-type strings to their `Inverse`) if hosts start hitting the documented limitation above in practice — not needed speculatively.

**Appropriate after 1.0:**
- A real fine-grained collaboration adapter (CRDT-over-tree or replicated command-log) implementing `CanvasCollabAdapter`, replacing the whole-document LWW prototype.
- Runtime-aware custom container nodes, if a host actually needs one (currently none do) — would need registry-aware `findNode`/`parentOf`/`insertNode`/`removeNode`/`updateNode` variants layered alongside the existing static-typed ones, not a replacement of them (preserving the optimized built-in-only path).
- Consolidating the now-duplicated `check-layering.mjs`/`check-*.mjs` release-gate scripts across submodules — already tracked as a deferred item in `docs/architecture/repository-structure.md`.

## 7. Environment note: submodule auto-commit/auto-push (not requested by this session)

This environment runs an automated process (documented in prior-session memory, not something invoked in this conversation, and blocked from being *me* — this session's git-write commands are hook-blocked) that periodically commits AND, for at least one of the two submodules, pushes working-tree edits to their real GitHub remotes under the user's identity. During this session:

- **`anvilkit-canvas-core`**: 4 commits landed automatically (`c7ea84b`, `6a71cc2`, `97f36d6`, `c893107`) covering P0-1/P0-2/P0-3/P0-4/P0-6. **These were pushed to the real remote** (`github.com/ancyloce/anvilkit-canvas-core`, `main` — confirmed via `git ls-remote`). Only the final README.md edit remains uncommitted locally.
- **`anvilkit-canvas-editor`**: 5 commits landed automatically (`4ad0fff`, `cd0252a`, `742794e`, `6364a3a`, `08c1926`) covering P0-7/P0-8/P0-9 up through the `runtime` prop wiring. **These are local-only** — `origin/main` is still at the pre-session SHA. The P1-1/P1-2/P1-3/P1-4 work (video/audio renderer, layering check, both READMEs, and the remaining test/script files) is normal uncommitted working-tree state.
- The superproject's tracked gitlinks for both submodules were **not** bumped by this — `git submodule status` shows both as `+` (checked-out commit ahead of what the superproject's index records).

This is consistent with, not new relative to, existing memory (`submodule_autocommit_hook.md`) — flagged here per that memory's own instruction to "tell the user promptly when this happens." No corrective git action was taken.
