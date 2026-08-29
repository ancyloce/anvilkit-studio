# ADR 0011: Canvas Collaboration Data Model

**Status:** Accepted  
**Date:** 2026-08-28  
**Owners:** Canvas, Collaboration, and Core maintainers  
**Plan:** `docs/plans/0039-anvilkit-canvas-product-development-plan.md`, E5

## Context

`createCanvasYjsBinding` currently stores an entire `CanvasIR` as one JSON
string in one `Y.Map` key. Yjs makes that register converge, but two concurrent
writes to different nodes or different fields still conflict at the document
key and one write is silently lost. Presence is already separate and
ephemeral, but persisted design state needs a granular schema before the
product can claim multi-writer collaboration.

The replacement must keep `CanvasIR` as the only render/save/export document,
admit remote data through the existing migration, document-budget, schema, and
invariant pipeline, and preserve the current transport-agnostic binding
boundary. The CRDT is a replicated storage encoding, not a second product IR.

## Decision

Canvas collaboration schema version 2 uses one Yjs document root per room and
projects deterministically to and from `CanvasIR`.

### Shared document layout

The root map is `${mapName}:document` and contains:

- `collaborationSchemaVersion`: the integer `2`;
- document scalar fields as independent registers;
- `pageOrder`: a `Y.Array<string>` of stable page IDs;
- `pages`: a `Y.Map<Y.Map>` keyed by page ID;
- `nodes`: a `Y.Map<Y.Map>` keyed by globally stable node ID;
- `assets`: a `Y.Map<string>` keyed by asset ID;
- `components`: a `Y.Map<Y.Map>` keyed by component definition ID; and
- `externalComponentSnapshots`: a `Y.Map<string>` keyed by immutable snapshot
  key.

Each page and component stores a stable root-node ID. Each node stores its
`type`, an independently addressable register for every non-structural field,
an ordered `Y.Array<string>` of child IDs when it is a container, a parent
register, and a deletion register. Arrays provide convergent ordering; the
parent register selects the single authoritative parent after concurrent
reparenting, so duplicate array references never duplicate a projected node.

Assets, components, and external snapshots are independently keyed. Component
definition fields and their root trees use the same field/node projection as
pages. Immutable external snapshots remain one value per integrity-derived
key.

### Rich text

Each `rich-text` node owns a `Y.Text`. Text content and span marks are encoded
as Yjs delta attributes; paragraph boundaries carry paragraph attributes.
Local reconciliation preserves common prefixes and suffixes so disjoint
character edits and mark edits merge without replacing the whole rich-text
value. Projection coalesces adjacent runs with identical marks into
`RichTextSpan` values.

Plain `text` nodes remain ordinary per-field registers because the product
does not expose a structured collaborative editing surface for that node kind.

### Ordering, conflicts, and deletion

- Different nodes and different fields of the same node are separate Yjs
  items and both edits survive.
- Same-field conflicts use Yjs's deterministic item ordering. Every replica
  projects the same winning value.
- Page and child order use stable IDs in Y.Array. Projection removes duplicate
  IDs deterministically and ignores references whose parent register selects a
  different parent.
- Delete is a tombstone on the page, node, or component map. Concurrent field
  updates remain in replicated history, but a winning tombstone keeps the item
  absent from `CanvasIR`. Undo may restore the item without inventing a new ID.
- A structural projection that contains a missing root, cycle, duplicate live
  ID, unreachable required node, or schema-invalid value is rejected before it
  reaches the editor store.

### Transactions and origins

One local `sceneStore` commit reconciles the changed document into one
`Y.Doc.transact` call tagged with the local peer object. Create, update,
delete, reorder, reparent, group, ungroup, page, component, asset, and text
changes therefore retain their command-level atomicity while writing only the
affected CRDT entries.

Remote projection is applied through `replaceDocumentSnapshot` when the host
provides the full store bundle, so history and transient editor state cannot
refer to the replaced projection. Observer callbacks are isolated from the
Yjs transaction.

### Collaborative undo and redo

A scoped `Y.UndoManager` tracks only the schema-v2 document root and only the
local peer origin. Remote transport origins and other peers are never tracked.
Undo and redo therefore reverse local-origin transactions without erasing
unrelated remote edits. Snapshot/recovery metadata and awareness are outside
the undo scope.

### Legacy migration and compatibility

On first open of a room that has the legacy whole-document `canvasIR` value but
no schema-v2 root:

1. decode through the normal bounded load pipeline;
2. preserve the exact legacy JSON in the v2 root as a recovery snapshot;
3. materialize the v2 schema in one transaction; and
4. mark the legacy room root with schema version 2.

The operation is idempotent. A corrupt legacy value is preserved and reported,
not overwritten. Once v2 exists, any later legacy-register write is a
mixed-schema fault: the v2 client stops local writes and surfaces an actionable
upgrade diagnostic. A root with a newer collaboration schema is read-only and
must not be written by this client.

Room authorization or transport handshakes should reject incompatible clients
before sync; the client-side gate is the final protection when a host transport
does not provide that capability.

### Offline and reconnect behavior

Yjs document state is the local work queue. Local transactions continue while
the transport reports offline or reconnecting, and the binding exposes sync
state plus the number of queued local transactions. On the next synced signal,
the transport exchanges Yjs updates, the replicas merge, and the queue count
returns to zero. Awareness remains ephemeral and is never written into the
persisted document root.

### Recovery and diagnostics

Invalid remote state remains present in the Y.Doc for investigation but is not
applied to the open editor document. The binding records stable diagnostic
codes for invalid projection, incompatible schema, mixed-schema writes, corrupt
legacy state, and repair outcomes. Hosts can export a recovery package
containing the Yjs state update, preserved legacy JSON when present, schema
version, diagnostics, and the last valid `CanvasIR`. Repair is explicit: it
rewrites schema v2 from the last valid editor document in one local-origin
transaction and never runs automatically.

## Validation and release gate

The collaboration suite must prove:

- disjoint node and same-node/different-field edits both survive;
- same-field, reorder, reparent, delete/update, group/ungroup, page,
  component, asset, and rich-text conflicts converge to valid `CanvasIR`;
- local undo preserves unrelated remote work;
- offline/reconnect and duplicate update delivery converge without duplicate
  nodes or broken order;
- legacy migration is one-shot, recoverable, and mixed schemas are blocked;
- incompatible clients cannot write; and
- at least 10,000 seeded randomized operations across multiple replicas finish
  with byte-identical projections and zero invalid documents.

## Puck contract

This decision does not create another render or authoring contract. Canvas
collaboration projects to the same declared `CanvasIR` consumed by load,
editor, preview, export, and persistence paths; Studio integrations continue
to obey the repository's Puck `Config`/`Data` boundary. Awareness, diagnostics,
and recovery metadata do not affect rendering and cannot carry undeclared
render state.

## Consequences

- Collaboration writes become proportional to changed fields and structures
  instead of document size.
- The schema and migration logic become public compatibility commitments of
  the Canvas collaboration subpath.
- Tombstones and Yjs history increase room size; server-side compaction and
  retention remain host/relay operational concerns.
- Projection still validates the whole candidate before editor adoption. This
  favors data safety over incremental render application and can be optimized
  later without changing the CRDT schema.
- Legacy clients must be excluded from a migrated room; silent dual writing is
  explicitly unsupported.

## Rejected alternatives

- **Keep the whole-document register:** deterministic convergence but silent
  loss of unrelated concurrent edits.
- **Replicated command log:** duplicates mutation semantics and requires a new
  causal replay/migration contract before it can safely project every current
  command.
- **Store a second collaboration-only document model:** violates the single
  authoring/render pipeline and creates drift between collaboration, save, and
  export.
- **Persist awareness in CanvasIR:** mixes ephemeral presence with durable
  product data and creates privacy, undo, and recovery ambiguity.
