# Canvas collaboration conflict model (FR-071)

**Status:** decision recorded — hybrid model chosen; server-arbitration
implementation is a follow-up build, not part of this decision.
**Owner:** canvas workgroup (`@anvilkit/canvas-core`, `@anvilkit/canvas-editor`
`./collab` subpath)
**Last updated:** 2026-07-13
**Related:** [`docs/architecture/realtime-collab.md`](./realtime-collab.md)
(the outer Puck/`PageIR`-level collaboration model — a sibling system, not
this one; see § 6 for how the two relate)

This document answers PRD `0011-anvilkit-canvas-mvp-delta-prd.md` FR-071 /
open question 5: which of the four allowed conflict models applies to
**canvas-subtree** (`CanvasIR`) collaboration.

---

## 1. Current baseline (what already exists)

Two collaboration primitives already ship inside
`@anvilkit/canvas-editor`'s optional `./collab` subpath
(`packages/capabilities/canvas/editor/src/collab/`):

1. **Presence** (`presence-bridge.ts`, `useCanvasPresence.ts`) — a
   `y-protocols/awareness`-backed cursor/selection broadcaster. Ephemeral,
   content-blind, already production-shaped.
2. **Whole-document LWW sync** (`binding.ts`) — `createCanvasYjsBinding`
   encodes the entire `CanvasIR` as one JSON blob under a single `Y.Map` key
   (`CANVAS_IR_KEY`) and relies on Yjs's key-level last-writer-wins to
   converge. Its own doc comment is explicit that this is
   *"the documented alpha posture; native per-node merge is the GA
   follow-up."*

`@anvilkit/canvas-core` itself has **zero** CRDT/yjs dependency today — the
whole-blob binding lives entirely in the editor's optional subpath, which is
never imported by canvas-editor's main entry (`src/index.ts` has no
`collab`/`yjs` reference, and `rslib.config.ts` builds unbundled, per-file
output — so the main bundle can only ever pull in what it actually imports).

Separately, canvas-m5-001 (this milestone, immediately prior task) added
`CanvasChangeRecord` + `commandToChangeRecord` + `replayChanges` to
`packages/capabilities/canvas/core/src/commands/change-events.ts` — a
framework/CRDT-free, persistable, replayable enrichment of every
`CanvasCommand` (actor id, timestamp, page id, affected node ids, source,
sequence). This is, structurally, a command-op-log record format that did
not exist before this milestone.

## 2. Decision

**Hybrid: CRDT presence (unchanged) + command op-log with server
arbitration (new, document mutations only).**

- **Presence stays exactly as shipped.** `y-protocols/awareness` continues to
  carry cursors/selection. No change to `presence-bridge.ts` or
  `useCanvasPresence.ts`.
- **Document sync moves from whole-blob LWW to a command op-log.** Instead of
  swapping the entire `CanvasIR` under one Yjs key, peers exchange
  `CanvasChangeRecord`s (canvas-m5-001). A server component assigns each
  record a total order (the `sequence` field); every replica applies records
  in that order via `replayChanges`, which re-runs each record's original
  `command` through the existing, unchanged `applyCommand` reducer.
- Today's whole-doc-LWW binding (`binding.ts`) is retroactively classified as
  the PRD's fourth option — **"whole-document LWW for non-production
  collaboration only."** It remains available as the low-effort/demo path
  (it already works, has tests, needs no server). The hybrid model above is
  the path to a production-grade GA collaboration story; migrating
  `binding.ts` from blob-swap to command-log transport is a follow-up build
  task, not part of this decision.

### 2.1 Why hybrid over the other three options

| Option | Why not chosen as primary |
| --- | --- |
| **CRDT document model** (mirror `CanvasIR` natively into Yjs `Y.Map`/`Y.Array`) | Requires porting canvas's much richer node/geometry/fill model into Yjs primitives — a large surface (mirrors what `realtime-collab.md` §1.1 calls the outer system's own deferred "GA target"). It would also pull Yjs deeper into the conflict-resolution logic than presence alone, working against the goal of keeping `canvas-core` CRDT-free *permanently*, not just for now. |
| **Whole-document LWW only** | The PRD itself scopes this option to "non-production collaboration only" — it is not an allowed GA answer, only the already-shipped alpha stopgap (see § 1). |
| **Pure command op-log (no CRDT at all)** | Drops the already-shipped, working presence layer for no benefit — presence has no conflict-resolution needs a CRDT is well-suited for (cursors are inherently last-write-wins-safe; there is nothing to "merge"). Replacing it would be pure churn. |
| **Hybrid (chosen)** | Reuses both existing assets: yjs Awareness for presence (already correct), and canvas-m5-001's freshly-built `CanvasChangeRecord`/`replayChanges` for document sync (already replay-deterministic, already framework/CRDT-free). No new dependency in `canvas-core`. Smaller surface than full CRDT-tree mirroring. |

### 2.2 No new `canvas-core` dependency

Nothing in this decision requires a code change to `canvas-core`.
`CanvasChangeRecord`/`replayChanges` (canvas-m5-001) already provide
everything the op-log side of the hybrid needs. The server-arbitration
component (sequencer) is a **collab-adapter / relay concern**, symmetrical
with the existing Hocuspocus-based relay infrastructure used elsewhere in
this repo for Puck-level collab — it is out of scope for `canvas-core` by
construction, since `canvas-core` only ever sees individual commands and a
pre-mutation IR, never a network.

### 2.3 yjs stays out of the main editor bundle

Unchanged from today: `y-protocols`/`yjs` are declared only under
`canvas-editor`'s `./collab` export subpath
(`editor/package.json` — `"./collab"` entry, backed by `src/collab/`), the
main `src/index.ts` barrel never imports from `src/collab/`, and
`rslib.config.ts` builds unbundled (one output file per source file, not a
single bundle graph) — so no bundler decision is even in play. The hybrid
model does not add a new import path from the main entry into `./collab`; it
only changes what `binding.ts` does internally with data that already flows
through the existing optional subpath.

## 3. Deterministic behavior — worked examples

All four examples assume: a server assigns a strictly increasing `sequence`
to every submitted `CanvasChangeRecord` in the order it receives them (its
"total order"), and every replica — including the submitter, once its own
record round-trips back with a server-assigned sequence — applies records
strictly in ascending `sequence` order via `replayChanges`. This is the same
"eventually consistent, deterministic" contract `realtime-collab.md` §2
documents for the outer system, restated here for the command-log transport:
after every replica has received every record up to sequence *N*, every
replica's `CanvasIR` is identical.

### 3.1 Concurrent node update (two actors edit the same property)

Actor A and actor B both have node `r1` with `fill: "#fff"` in their local
view.

| Seq | Actor | Command | Effect after replay |
| --- | --- | --- | --- |
| 10 | A | `node.update r1 {fill:"#f00"}` | `r1.fill = "#f00"` |
| 11 | B | `node.update r1 {fill:"#00f"}` | `r1.fill = "#00f"` |

Every replica applies seq 10 then seq 11 in that order — **whichever record
the server assigned the higher sequence wins**, deterministically and
identically on every replica. This is ordinary last-writer-wins, but at
per-command granularity, not whole-document granularity: a concurrent edit
to a *different* node or a *different* property on the same node is a
separate record and is never overwritten by this race (unlike the current
alpha whole-blob LWW, which would silently drop one side's entire document
snapshot even for disjoint edits — see `realtime-collab.md` §2.1 for the
same limitation in the outer system).

### 3.2 Delete/update race (one actor deletes a node another is editing)

| Seq | Actor | Command | Effect after replay |
| --- | --- | --- | --- |
| 4 | B | `node.delete r1` | `r1` removed |
| 5 | A | `node.update r1 {fill:"#f00"}` | no-op (target missing) |

`applyCommand`'s reducer contract requires its target to exist (canvas-core
throws on a missing node — see `commands/transaction.ts`'s
all-or-nothing-batch tests) and this decision **does not change that
reducer**. The collab adapter (not `canvas-core`) is responsible for
tolerance at replay time: when replaying a server-ordered record whose
target was removed by an earlier record in the same sequence, the adapter
catches the "not found" error from `applyCommand`/`replayChanges` for that
one record, drops it, and — since this is attributable to a genuine
concurrent edit rather than a bug — surfaces a conflict diagnostic to actor
A's client (mirroring `realtime-collab.md` §6's "no conflict diagnostics
from the CRDT layer" gap, which the op-log model can close precisely because
each record is a discrete, attributable unit, unlike a blob swap). Every
replica reaches the same final state: `r1` does not exist, deterministically.

### 3.3 Page reorder conflict

Pages start as `[A, B, C]`.

| Seq | Actor | Command | Array after this step |
| --- | --- | --- | --- |
| 10 | 1 | `page.reorder C → index 0` (computed against `[A,B,C]`) | `[C, A, B]` |
| 11 | 2 | `page.reorder A → index 2` (computed against actor 2's stale local `[A,B,C]`) | `[C, B, A]` |

Every replica applies seq 10 then seq 11 **against the current array state
at apply time**, not against whichever state the issuing client originally
computed the command against. This is what makes it deterministic — but it
is an explicit trade-off, not free: actor 2's `to: index 2` was chosen when
they believed the array was still `[A,B,C]`; by the time it applies, `C` has
already moved, so the *literal outcome* may not match actor 2's *intent* at
submission time. This is called out explicitly rather than glossed over: a
true CRDT list (e.g. Yjs `Y.Array`) preserves relative-order intent better in
this exact scenario, and is one honest reason a full CRDT document model
remains a legitimate future option if reorder conflicts turn out to be
frequent in practice. For a design tool with live presence (actors can see
each other's cursors and in-flight drags), we judge this trade-off
acceptable for GA — it is the same trade-off the outer Puck-level system
already ships with today for its own move/insert interleavings
(`realtime-collab.md` §2.1).

### 3.4 Asset replacement race

| Seq | Actor | Command | Effect after replay |
| --- | --- | --- | --- |
| 20 | A | `image.replace img1 a→x` | `img1.assetId = "x"` |
| 21 | B | `image.replace img1 x→y` (submitted against A's not-yet-arrived state, but the server records B's actual prior local value in the command; canvas-core validates `fromAssetId` only against what canvas-core itself receives) | `img1.assetId = "y"` |

Same total-order-decides-the-winner semantics as § 3.1: the higher-sequence
record wins, deterministically, on every replica. The losing actor's
optimistic local render (if any) is corrected the moment their client
replays up through sequence 21.

## 4. What this decision does *not* cover

- The actual server/sequencer implementation (who assigns `sequence`, how
  clients submit and receive records, reconnection/replay-catch-up) is a
  follow-up build task. This task is scoped to the model decision and its
  semantics, per the task file's own framing.
- Migrating `binding.ts` off whole-blob LWW onto the command-log transport is
  a follow-up build task; the alpha binding is left as-is and continues to
  satisfy the "non-production LWW" option in the interim.
- Conflict *diagnostics UI* (surfacing "your edit was overridden" to a user)
  is out of scope here — § 3.2 only establishes that the underlying data is
  attributable enough to make such a diagnostic buildable later, mirroring
  the gap already documented for the outer system in `realtime-collab.md` §6.

## 5. Acceptance criteria check

- ✅ Conflict semantics are not vague — worked examples exist for all four
  required scenarios (§ 3).
- ✅ Deterministic behavior is defined with examples, not just asserted
  (§ 3, each table shows every replica converging on the same final state).
- ✅ The chosen model does not force yjs into the main editor bundle (§ 2.3);
  confirmed unchanged from the current baseline (§ 1).
- ✅ No new dependency added to `canvas-core` (§ 2.2).

## 6. Relationship to the outer Puck-level collaboration model

`docs/architecture/realtime-collab.md` documents `@anvilkit/plugin-collab-yjs`,
which operates on the **outer** Puck `PageIR` (the whole page/document,
including non-canvas components) and is a separate package, separate Yjs
document, and separate decision from this one. The two systems currently
share the same alpha shape (whole-blob JSON under one Yjs key, GA follow-up
deferred) purely by convergent evolution, not by a shared implementation.
This decision deliberately does **not** converge canvas onto the outer
system's planned GA path (native CRDT-tree mirroring) — see § 2.1 for why a
command op-log fits canvas's existing assets (m5-001) better than porting
`CanvasIR` into Yjs would.

## 7. References

- `packages/capabilities/canvas/core/src/commands/change-events.ts` —
  `CanvasChangeRecord`, `commandToChangeRecord`, `replayChanges` (m5-001).
- `packages/capabilities/canvas/core/src/commands/transaction.ts` —
  `applyCommands`, `TransactionApplyResult.records`.
- `packages/capabilities/canvas/editor/src/collab/binding.ts` — current
  whole-blob LWW alpha binding (`createCanvasYjsBinding`).
- `packages/capabilities/canvas/editor/src/collab/presence-bridge.ts`,
  `useCanvasPresence.ts` — presence layer, unchanged by this decision.
- `packages/capabilities/canvas/editor/package.json` — `"./collab"` export
  subpath boundary (lines ~20-28).
- [`docs/architecture/realtime-collab.md`](./realtime-collab.md) — sibling
  decision for the outer Puck-level document model.
- `docs/prd/0011-anvilkit-canvas-mvp-delta-prd.md` — FR-071 (§10.8), open
  question 5 (§18).
