# Editor Command and Transaction Contract Freeze (CORE-P0-001)

| Field | Value |
|---|---|
| Status | **Frozen** (2026-07-22) — recorded by CORE-P0-001 (PLAN-0020 v1.2); owner ratification per PLAN-0020 §22 pending |
| Task | CORE-P0-001 — Freeze editor command and transaction contracts |
| Sources | DD-0019 v1.4 §10.1, §10.3 (semantics 1–4), §10.5, §14.6, §22.4, §9.5; ADR 0005; PLAN-0020 Section 17 items 4–5 |
| Consumers | CORE-P0-003 (`@anvilkit/contracts/editor`), CORE-P0-005D (component schemas), CORE-P0-008 (reducer), all of EP-13 |
| Baseline | `d81ed4b4` (implementation baseline, PLAN-0020 Document Control) |

This record freezes every command/transaction contract decision that DD-0019
names but does not define, so that CORE-P0-003 publishes the `EditorCommand`
union **complete** — no placeholder members, no within-phase revision. Each
numbered section answers one item of the CORE-P0-001 checklist.

## 1. Shared representations

### 1.1 Identifiers (checklist: definition and instance identifier representation)

- `ComponentDefinitionId = string` — opaque, non-empty, caller-generated
  (`crypto.randomUUID()` at the call site; see D-7 below), unique within
  `AuthoringStateV1.componentDefinitions`, stable across definition revisions.
- **Definition node IDs** are ordinary Puck node-id strings scoped to the
  definition's `root` subtree; they stay stable across definition revisions
  (DD §14.2). Uniqueness within one definition is invariant 6 (§7.2).
- **Instance node IDs** are ordinary page (Puck) node IDs.
- **The runtime composite `${instanceNodeId}::${definitionNodeId}` is never
  persisted.** No persisted schema field may hold the composite form; it is
  constructed only in render-time code. Schema validation asserts override
  keys are bare definition node IDs, and a dev-invariant (CORE-P0-007 helper)
  guards writes.

### 1.2 Property paths (checklist: property-path representation)

```ts
export type PropertyPath = readonly (string | number)[];

export interface ComponentOverrideTarget {
  readonly definitionNodeId: string;
  readonly propertyPath: PropertyPath;
}
```

- Segments are object keys (`string`) and array indices (`number`), matching
  the existing `EditorError.path` and `ComponentPropDefinition.sourcePath`
  conventions (DD §9.5, §14.2). No string-encoded dot/bracket paths.
- `propertyPath` is rooted at the definition node's `props` object and MUST
  have ≥1 segment (the whole props bag is not an addressable override target).

### 1.3 Responsive layer addressing (checklist: breakpoint/layer/responsive scope)

```ts
export type ResponsiveLayerRef = "base" | BreakpointId;
```

- Commands that write layered values carry an explicit layer field — there is
  no ambient "current breakpoint" input to validation or reduction. The DD
  §10.1 field name `breakpointId: BreakpointId | "base"` is kept verbatim on
  `SetNode*Command`s; override-targeted fields named `layer` use the same
  alias.
- The literal `"base"` is reserved: a `BreakpointDefinition.id` MUST NOT equal
  `"base"` (schema-enforced, CORE-P0-005B).
- A command addressing a breakpoint id absent from
  `AuthoringStateV1.breakpoints` (or disabled) rejects with
  `EDITOR_BREAKPOINT_INVALID`.

## 2. The frozen `EditorCommand` union (all 20 members)

Type literals follow the `subject[.facet].verb` pattern set by DD §10.1's
`"node.layout.set"`. All members extend `EditorCommandBase` (`id`,
`expectedRevision`, `source`, `timestamp` — DD §10.1 verbatim).

| Member | `type` literal | Payload (beyond base) |
|---|---|---|
| `SetNodeLayoutCommand` | `node.layout.set` | `nodeIds: readonly string[]`, `breakpointId: ResponsiveLayerRef`, `patch: EditorPatch<LayoutSpec>` (DD-defined shape; patch semantics D-8) |
| `SetNodeStyleCommand` | `node.style.set` | `nodeIds`, `breakpointId`, `patch: EditorPatch<VisualStyleSpec>` |
| `SetNodeTypographyCommand` | `node.typography.set` | `nodeIds`, `breakpointId`, `patch: EditorPatch<TypographySpec>` |
| `SetNodeVisibilityCommand` | `node.visibility.set` | `nodeIds`, `breakpointId`, `hidden: boolean \| null` (`null` removes the value at that layer — D-8) |
| `SetNodeLockCommand` | `node.lock.set` | `nodeIds`, `locked: boolean` (lock is not responsive) |
| `RenameNodeCommand` | `node.rename` | `nodeId: string`, `name: string \| null` (`null` clears; single-target by design) |
| `SetResponsiveOverrideCommand` | `node.responsiveOverride.set` | `nodeIds`, `breakpointId: BreakpointId` (never `"base"`), `family: ResponsiveFamily` — see D-1 |
| `CreateStyleDefinitionCommand` | `styleDefinition.create` | `definition: StyleDefinitionV1` (caller-supplied id; timestamps from `command.timestamp`, D-7) |
| `AttachStyleDefinitionCommand` | `styleDefinition.attach` | `nodeIds`, `styleDefinitionId`, `layer: ResponsiveLayerRef`, `position?: number` (ordered multi-attach) |
| `CreateTokenCommand` | `token.create` | `token: DesignToken` (caller-supplied id) |
| `UpdateTokenCommand` | `token.update` | `tokenId: string`, `patch: DeepPartial<Omit<DesignToken, "id">>` |
| `CreateComponentDefinitionCommand` | `component.definition.create` | `definition: ComponentDefinitionV1`, `replaceNodeIds: readonly string[]`, `instanceNodeId: string` — atomic create-from-selection (DD §14.3) |
| `DeleteComponentDefinitionCommand` | `component.definition.delete` | **frozen §3.1** |
| `DetachComponentInstanceCommand` | `component.instance.detach` | `instanceNodeIds: readonly string[]` (multi-select detach = one intent) |
| `DetachAllComponentInstancesCommand` | `component.definition.detachAll` | **frozen §3.2** |
| `ResetComponentOverrideCommand` | `component.override.reset` | **frozen §3.3** |
| `ResetAllComponentOverridesCommand` | `component.override.resetAll` | **frozen §3.4** |
| `PromoteComponentOverrideCommand` | `component.override.promote` | **frozen §3.5** |
| `CreateInteractionCommand` | `interaction.create` | `interaction: InteractionV1` (caller-supplied id) |
| `UpdateBindingCommand` | `binding.update` | `binding: BindingV1` — upsert semantics (the union has no separate create; "update" = write-through) |
| `BatchEditorCommand` | `batch` | `label: string`, `commands: readonly AtomicEditorCommand[]` (DD-defined; non-empty, ≤200 — §5) |

**D-1 — `SetResponsiveOverrideCommand` role.** DD names the member without a
payload. Frozen split: family set-commands (`node.layout.set` etc.) *write
values* at any layer via `breakpointId`; `node.responsiveOverride.set`
*removes an entire family override entry* at a breakpoint, resuming
inheritance — the whole-override form of DD §9.1/§12.3's "`null` clears the
local override and resumes inheritance". There is no inheritance-blocking
tombstone in the model: DD defines `null` as removal, and compaction
(CORE-P0-005F) never persists nulls.
`ResponsiveFamily = "layout" | "style" | "typography" | "hidden" | "styleRefs"`.

**D-8 — Patch semantics (`EditorPatch<T>`).** Command patches are recursive
partials in which a property set to `null` means "remove this property at
the addressed layer" (DD §9.1 `null` semantics applied property-wise):
`EditorPatch<T>` = for each optional property, `T[K] | EditorPatch<T[K]> |
null`. `null` is a **write-time signal only** — reducers translate it into
key removal, spec objects never store nulls, and serialization never emits
them (`undefined`/absent = never written, DD §9.1).

**D-2 — Union completeness and evolution.** The Phase 0 published union is
exactly these 20 members. Later phases MAY add members additively through API
review + snapshot gates (e.g. style-definition detach in EP-12, breakpoint-set
editing in EP-06); no member published now may change shape within Phase 0.

**D-3 — Joint tree+sidecar reduction.** `component.definition.create`,
`component.instance.detach`, `component.definition.detachAll`, and the
detach-all→delete batch mutate the Puck content tree *and* the sidecar in one
commit. The §24.2 reducer envelope covers this: the Phase 2 reducer for these
commands operates over `(PuckData, AuthoringStateV1)` jointly and still
commits through one `setData`. Payloads frozen here; reduction semantics are
Phase 2 scope (per CORE-P0-001's task boundary).

## 3. The five lifecycle command payloads (checklist item 1)

```ts
export interface DeleteComponentDefinitionCommand extends EditorCommandBase {
  readonly type: "component.definition.delete";
  readonly definitionId: ComponentDefinitionId;
}

export interface DetachAllComponentInstancesCommand extends EditorCommandBase {
  readonly type: "component.definition.detachAll";
  readonly definitionId: ComponentDefinitionId;
}

export interface ResetComponentOverrideCommand extends EditorCommandBase {
  readonly type: "component.override.reset";
  readonly instanceNodeId: string;
  readonly target: ComponentOverrideTarget;
  readonly layer: ResponsiveLayerRef;
}

export interface ResetAllComponentOverridesCommand extends EditorCommandBase {
  readonly type: "component.override.resetAll";
  readonly instanceNodeIds: readonly string[];
}

export interface PromoteComponentOverrideCommand extends EditorCommandBase {
  readonly type: "component.override.promote";
  readonly instanceNodeId: string;
  readonly target: ComponentOverrideTarget;
  readonly layer: ResponsiveLayerRef;
}
```

Notes:

- **§3.1 delete** carries no confirmation token: confirmation is a UI/workflow
  concern that materializes as either cancel (no command) or the
  detach-all→delete batch (§4). A bare delete with live instances rejects
  (§4). Deleting an unknown `definitionId` rejects with
  `EDITOR_DEFINITION_UNAVAILABLE`.
- **§3.2 detach-all** is document-wide: it materializes every instance of the
  definition in page scope *and* inside other definitions' roots (nesting ≤10),
  each per DD §14.4.
- **§3.3 reset-one** is layer-addressed: DD §14.6 "at the current layer" is
  made explicit via the required `layer` field (commands are self-contained;
  no ambient layer).
- **§3.4 reset-all** removes every override on each listed instance across
  all layers (prop overrides and node overrides), returning it to
  definition-plus-variant resolution. Multi-instance = one intent.
- **§3.5 promote** writes the resolved override value into the definition
  default, propagates (ED-COMP-002), and removes the now-redundant instance
  override in the same atomic commit (DD §14.6).

## 4. Deletion mode × confirmation policy (checklist item: policy interaction)

`EditorPolicies.componentDefinitionDelete` (DD §22.4):

- **`"confirm-detach-all"` (default).**
  - Zero live instances → `component.definition.delete` commits directly.
  - Live instances → a bare delete rejects with `EDITOR_DEFINITION_REFERENCED`
    (`details.instanceCount`, `details.instanceNodeIds` capped at 50). The UI
    confirmation dialog (showing the count) offers cancel or detach-all;
    detach-all issues **one batch** `[component.definition.detachAll,
    component.definition.delete]` — one history-recording dispatch (DD §14.6).
    Under sequential validation (§5) the delete validates against the
    post-detach intermediate state and passes.
- **`"block-when-referenced"`.**
  - The policy check for `component.definition.delete` runs against the
    **batch-entry state**, not the intermediate state: if the definition had
    ≥1 live instance when the transaction began, the delete — and therefore
    the whole batch — rejects with `EDITOR_DEFINITION_REFERENCED`. No single
    transaction can take a referenced definition to deleted. A host that
    wants deletion must commit detach-all as its own intent first (two
    history entries, deliberate). The editor UI does not offer the detach-all
    confirmation path under this policy.
- The atomicity invariant holds under both policies: no committed state may
  leave instances referencing a deleted definition.

## 5. Batch semantics (checklist items: sequential validation; all-or-nothing)

Resolving the §10.3-vs-§14.6 contradiction exactly as PLAN-0020 proposed:

1. **Sequential validation against intermediate state.** Command *k* in a
   batch validates against the state produced by commands *1..k−1*. §10.3's
   "validate batches atomically" is read as "the batch validates and commits
   as one atomic unit", not "all members validate against the same initial
   state". Policy checks explicitly defined against batch-entry state (§4)
   are the recorded exceptions.
2. **All-or-nothing commit.** If any member fails validation or reduction,
   the whole batch rejects; the failing member's errors are surfaced with
   `details.batchIndex`. On success the port performs exactly one `setData`
   with `recordHistory: true` (single-intent history rule, DD §10.5).
3. **No nesting.** `commands` accepts `AtomicEditorCommand` only (DD type);
   schema-enforced.
4. **Size cap.** ≤200 commands per batch (aligned with the DD §21.2 AI
   proposal limit); beyond → `EDITOR_LIMIT_EXCEEDED`.
5. **Revision.** Only the batch-level `expectedRevision` is compared; the
   members' own `expectedRevision` fields are ignored (documented in the
   published doc comments). A committed batch increments `revision` by
   exactly 1. Member `id`s remain distinct for diagnostics; events reference
   the batch `id`.
6. **Noop.** A batch whose net effect is deep-equal state is a `"noop"`
   result: no dispatch, no revision bump, no history entry.

## 6. Main-component scope (checklist item: scope requirements)

Editing scope (`EditorSelectionState.scope`, DD §10.6) is transient UI state —
it is not part of `AuthoringStateV1`, so the **pure reducer is
scope-independent**. Frozen rules:

- `component.override.promote` is a definition edit: the **editor UI** routes
  it through main-component mode (DD §14.6) — the promote affordance surfaces
  only there. At the contract level the command is self-contained and
  validates structurally; plugin/AI-originated promotes are guarded by the
  §21.2 proposal/confirmation flow (`allowPluginSilentCommands`), not by a
  scope check they cannot hold.
- The editor UI MUST NOT offer `component.definition.delete` for the
  definition whose isolated scope is currently active (exit first) — a UI
  flow rule, not a reducer rule.
- All other commands are scope-agnostic; selections can never span scopes
  (DD §10.6, enforced by the selection store in CORE-P1A-002).

## 7. Selection result after each operation (checklist item)

One uniform **selection mapping rule** replaces per-command cases: after any
committed transaction, each selected node id maps through the change set —

- replaced → its replacement root (detached instance → materialized root;
  create-from-selection → the new instance node);
- removed → dropped from the selection;
- otherwise unchanged. Primary id = first surviving/mapped id in document
  order; an emptied selection becomes no-selection.

Applied to the five: delete (no instances) — unchanged; detach /
detach-all→delete batch — materialized roots replace selected instances;
reset-one / reset-all / promote — structurally unchanged, selection kept.
`component.definition.create` — the new instance node is selected (DD §14.3).

## 8. Error mappings per command (checklist item)

Common validations (every command): revision mismatch →
`EDITOR_COMMAND_CONFLICT`; unknown target node → `EDITOR_NODE_NOT_FOUND`;
mutation targeting a locked node or a node with a locked ancestor →
`EDITOR_NODE_LOCKED` (exemption: `node.lock.set` with `locked: false` must be
able to unlock); count/byte caps → `EDITOR_LIMIT_EXCEEDED`; unknown/disabled
breakpoint → `EDITOR_BREAKPOINT_INVALID`.

| Command | Additional mappings |
|---|---|
| `node.layout.set` / `node.style.set` / `node.typography.set` | invalid typed CSS value → `EDITOR_INVALID_CSS_VALUE`; capability absent on target component → `EDITOR_CAPABILITY_UNSUPPORTED` |
| `node.visibility.set` / `node.rename` / `node.responsiveOverride.set` | — (common only) |
| `styleDefinition.create` / `token.create` / `interaction.create` | duplicate id → reject `EDITOR_COMMAND_CONFLICT` (`details.reason: "duplicate-id"`) |
| `token.update` | unknown token → `EDITOR_NODE_NOT_FOUND` (`details.kind: "token"`); alias cycle introduced → `EDITOR_TOKEN_CYCLE` |
| `styleDefinition.attach` | unknown definition → `EDITOR_NODE_NOT_FOUND` (`details.kind: "styleDefinition"`) |
| `component.definition.create` | recursive graph → `EDITOR_COMPONENT_CYCLE` (full path in `details.cycle`); unserializable/scope-splitting selection → `EDITOR_CAPABILITY_UNSUPPORTED` |
| `component.definition.delete` | live instances per policy (§4) → `EDITOR_DEFINITION_REFERENCED` (`details.instanceCount`); unknown definition → `EDITOR_DEFINITION_UNAVAILABLE` |
| `component.definition.detachAll` | unknown definition → `EDITOR_DEFINITION_UNAVAILABLE` |
| `component.instance.detach` | target is not an instance → `EDITOR_NODE_NOT_FOUND` (`details.kind: "componentInstance"`); unresolvable definition → detach still succeeds? **No** — rejects `EDITOR_DEFINITION_UNAVAILABLE` (materialization needs the definition; instance data stays untouched per ED-COMP-007) |
| `component.override.reset` / `.resetAll` | unknown instance → `EDITOR_NODE_NOT_FOUND`; unknown target/no such override → `"noop"` result (not an error) |
| `component.override.promote` | unresolvable definition → `EDITOR_DEFINITION_UNAVAILABLE`; unknown override target → `EDITOR_NODE_NOT_FOUND` (`details.kind: "override"`) |
| `binding.update` | oversized descriptor → `EDITOR_LIMIT_EXCEEDED` |
| `batch` | first failing member's errors + `details.batchIndex` (§5) |

The `EditorErrorCode` union is exactly the 14 codes of DD §9.5 — this freeze
introduces no new codes; sub-cases are distinguished via `details`.

## 9. History behavior (checklist item)

DD §10.5 single-intent history rule, restated as the frozen contract: every
committed transaction (atomic or batch) performs **at most one**
history-recording dispatch (`recordHistory: true`); noops perform zero.
Puck's 250 ms record debounce MAY merge adjacent intents — accepted native
behavior, no private history APIs. `revision` is restored by undo (it lives
in the sidecar and travels with the history entry).

## 10. Revision behavior (checklist item)

- `expectedRevision` is compared strictly (`===`) against
  `AuthoringStateV1.revision` **before** reduction (DD §10.3 rule 1).
  Mismatch → reject `EDITOR_COMMAND_CONFLICT`. v1 is reject-only: no
  automatic rebase; callers re-read the snapshot and re-issue.
- A committed transaction produces exactly `revision + 1` (batches included).
- Deep-equal reduction output → `"noop"`: no dispatch, no revision change.
- Studio mount recanonicalizes the revision (DD §10.3 rule 5); host document
  replacement is by key-remount.

## 11. Determinism inputs (supporting decision)

**D-7.** Reducers are pure and deterministic: **all generated ids are
caller-supplied** in command payloads (`crypto.randomUUID()` at call sites —
ports/UI — never inside reducers), and all `createdAt`/`updatedAt` values
derive from `command.timestamp` (epoch ms → ISO), never from `Date.now()`
inside a reducer.

## Checklist → decision index

| CORE-P0-001 checklist item | Answered in |
|---|---|
| Five lifecycle payload interfaces | §3 |
| Definition/instance identifier representation | §1.1 |
| Property-path representation | §1.2 |
| Breakpoint/layer/responsive scope addressing | §1.3 |
| Main-component scope requirements | §6 |
| Deletion mode × confirmation policy | §4 |
| Selection result after each operation | §7 |
| Exact error mappings per command | §8 |
| Sequential batch validation vs intermediate state | §5.1 |
| All-or-nothing batch commit | §5.2 |
| History behavior | §9 |
| Revision behavior | §10 |

PLAN-0020 Section 17 items 4 and 5 flip to **Resolved** on this record.
