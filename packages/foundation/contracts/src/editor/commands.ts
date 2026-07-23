/**
 * @file The typed editor command and transaction contract
 * (DD-0019 §10.1–§10.3, §10.6, §14.6; frozen by CORE-P0-001 —
 * `docs/architecture/editor-command-transaction-contract-freeze.md`).
 *
 * Every mutation from the inspector, canvas, layers, keyboard,
 * plugin, or AI flows through this layer; no entry point may write
 * `root.props.__anvilkit` directly. Reducers are pure and
 * deterministic: all generated IDs are caller-supplied
 * (`crypto.randomUUID()` at call sites, never inside reducers) and
 * timestamps derive from `EditorCommandBase.timestamp` (freeze D-7).
 */

import type { AuthoringStateV1 } from "./authoring-state.js";
import type { BindingV1 } from "./bindings.js";
import type {
	ComponentDefinitionId,
	ComponentDefinitionV1,
	ComponentOverrideTarget,
} from "./components.js";
import type { EditorError } from "./errors.js";
import type { InteractionV1 } from "./interactions.js";
import type {
	BreakpointDefinition,
	BreakpointId,
	ResponsiveFamily,
	ResponsiveLayerRef,
} from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
import type {
	StyleDefinitionId,
	StyleDefinitionV1,
} from "./style-definitions.js";
import type { DesignToken } from "./tokens.js";
import type { EditorPatch } from "./values.js";

/**
 * Fields shared by every command (DD-0019 §10.1, verbatim).
 * `expectedRevision` is compared strictly against
 * `AuthoringStateV1.revision` before reduction; a mismatch rejects
 * with `EDITOR_COMMAND_CONFLICT` (v1 is reject-only, no auto-rebase).
 */
export interface EditorCommandBase {
	readonly id: string;
	readonly expectedRevision: number;
	readonly source:
		| "inspector"
		| "canvas"
		| "layers"
		| "shortcut"
		| "plugin"
		| "ai";
	readonly timestamp: number;
}

/** Write a layout patch at a layer (DD-0019 §10.1, verbatim shape). */
export interface SetNodeLayoutCommand extends EditorCommandBase {
	readonly type: "node.layout.set";
	readonly nodeIds: readonly string[];
	readonly breakpointId: ResponsiveLayerRef;
	readonly patch: EditorPatch<LayoutSpec>;
}

/** Write a visual-style patch at a layer. */
export interface SetNodeStyleCommand extends EditorCommandBase {
	readonly type: "node.style.set";
	readonly nodeIds: readonly string[];
	readonly breakpointId: ResponsiveLayerRef;
	readonly patch: EditorPatch<VisualStyleSpec>;
}

/** Write a typography patch at a layer. */
export interface SetNodeTypographyCommand extends EditorCommandBase {
	readonly type: "node.typography.set";
	readonly nodeIds: readonly string[];
	readonly breakpointId: ResponsiveLayerRef;
	readonly patch: EditorPatch<TypographySpec>;
}

/**
 * Set editor-metadata visibility at a layer. `null` removes the value
 * at that layer (freeze D-8). Compiles to `display:none`; never
 * overwrites `layout.display`.
 */
export interface SetNodeVisibilityCommand extends EditorCommandBase {
	readonly type: "node.visibility.set";
	readonly nodeIds: readonly string[];
	readonly breakpointId: ResponsiveLayerRef;
	readonly hidden: boolean | null;
}

/**
 * Lock or unlock nodes. Lock is not responsive. Unlocking is the one
 * mutation exempt from the locked-node rejection rule (freeze §8).
 */
export interface SetNodeLockCommand extends EditorCommandBase {
	readonly type: "node.lock.set";
	readonly nodeIds: readonly string[];
	readonly locked: boolean;
}

/** Rename one node's authoring name; `null` clears it. */
export interface RenameNodeCommand extends EditorCommandBase {
	readonly type: "node.rename";
	readonly nodeId: string;
	readonly name: string | null;
}

/**
 * Remove an entire family override entry at a breakpoint, resuming
 * inheritance (freeze D-1). Writing values at a breakpoint uses the
 * family set-commands with `breakpointId`; there is no
 * inheritance-blocking tombstone in the model.
 */
export interface SetResponsiveOverrideCommand extends EditorCommandBase {
	readonly type: "node.responsiveOverride.set";
	readonly nodeIds: readonly string[];
	/** Never `"base"` — the base layer is not an override. */
	readonly breakpointId: BreakpointId;
	readonly family: ResponsiveFamily;
}

/**
 * Replace the document's breakpoint set (DD-0019 §12.2; added
 * additively by CORE-P1A-008 per freeze D-2 — breakpoint-set editing
 * was explicitly reserved for EP-06). One command covers the whole
 * CRUD surface: create, edit, reorder (order is normalized from
 * widths), enable/disable, and delete. §12.2 invariants are
 * validation-enforced: at most eight breakpoints (hosts may tighten
 * via `EditorPolicies.maxBreakpoints`), unique integer `maxWidth`
 * 240–7680, ids unique and never the reserved literal `"base"`.
 *
 * For each breakpoint removed by the new set, `removedOverrides`
 * chooses what happens to node values written at that layer:
 * `"merge-to-base"` folds them into the base layer property-wise;
 * `"discard"` (the default) drops them. The deletion-preview UI
 * surfaces both options before dispatch (§12.2).
 */
export interface SetBreakpointsCommand extends EditorCommandBase {
	readonly type: "breakpoints.set";
	readonly breakpoints: readonly BreakpointDefinition[];
	readonly removedOverrides?: Readonly<
		Record<BreakpointId, "merge-to-base" | "discard">
	>;
}

/** Create a reusable style definition (caller-supplied id). */
export interface CreateStyleDefinitionCommand extends EditorCommandBase {
	readonly type: "styleDefinition.create";
	readonly definition: StyleDefinitionV1;
}

/** Attach a style definition to nodes at a layer, in list order. */
export interface AttachStyleDefinitionCommand extends EditorCommandBase {
	readonly type: "styleDefinition.attach";
	readonly nodeIds: readonly string[];
	readonly styleDefinitionId: StyleDefinitionId;
	readonly layer: ResponsiveLayerRef;
	/** Insertion index into the ordered ref list; append when absent. */
	readonly position?: number;
}

/** Create a design token (caller-supplied id). */
export interface CreateTokenCommand extends EditorCommandBase {
	readonly type: "token.create";
	readonly token: DesignToken;
}

/** Patch an existing design token (id immutable). */
export interface UpdateTokenCommand extends EditorCommandBase {
	readonly type: "token.update";
	readonly tokenId: string;
	readonly patch: EditorPatch<Omit<DesignToken, "id">>;
}

/**
 * Atomic create-from-selection (DD-0019 §14.3): create the definition,
 * replace the selected nodes with one instance node, and select it —
 * one history-recording dispatch.
 */
export interface CreateComponentDefinitionCommand extends EditorCommandBase {
	readonly type: "component.definition.create";
	readonly definition: ComponentDefinitionV1;
	/** The page nodes the new instance replaces, in parent order. */
	readonly replaceNodeIds: readonly string[];
	/** Caller-supplied node id for the new instance node. */
	readonly instanceNodeId: string;
}

/**
 * Delete a component definition (freeze §3.1/§4). Carries no
 * confirmation token: confirmation is a UI flow that materializes as
 * either cancel or the detach-all→delete batch.
 */
export interface DeleteComponentDefinitionCommand extends EditorCommandBase {
	readonly type: "component.definition.delete";
	readonly definitionId: ComponentDefinitionId;
}

/** Detach instances into ordinary page nodes (freeze §2). */
export interface DetachComponentInstanceCommand extends EditorCommandBase {
	readonly type: "component.instance.detach";
	readonly instanceNodeIds: readonly string[];
}

/**
 * Materialize every instance of a definition, document-wide — page
 * scope and inside other definitions' roots (freeze §3.2).
 */
export interface DetachAllComponentInstancesCommand extends EditorCommandBase {
	readonly type: "component.definition.detachAll";
	readonly definitionId: ComponentDefinitionId;
}

/**
 * Remove a single instance override at one layer, addressed by
 * definition node and property path (freeze §3.3; ED-COMP-008 rule 1).
 */
export interface ResetComponentOverrideCommand extends EditorCommandBase {
	readonly type: "component.override.reset";
	readonly instanceNodeId: string;
	readonly target: ComponentOverrideTarget;
	readonly layer: ResponsiveLayerRef;
}

/**
 * Remove every override on each listed instance across all layers,
 * returning it to definition-plus-variant resolution (freeze §3.4).
 */
export interface ResetAllComponentOverridesCommand extends EditorCommandBase {
	readonly type: "component.override.resetAll";
	readonly instanceNodeIds: readonly string[];
}

/**
 * Write the resolved override value into the definition default,
 * propagate, and remove the now-redundant instance override in the
 * same atomic commit (freeze §3.5; ED-COMP-008 rule 3). A definition
 * edit — the editor UI routes it through main-component mode.
 */
export interface PromoteComponentOverrideCommand extends EditorCommandBase {
	readonly type: "component.override.promote";
	readonly instanceNodeId: string;
	readonly target: ComponentOverrideTarget;
	readonly layer: ResponsiveLayerRef;
}

/** Create an interaction (caller-supplied id). */
export interface CreateInteractionCommand extends EditorCommandBase {
	readonly type: "interaction.create";
	readonly interaction: InteractionV1;
}

/** Write a binding — upsert semantics (freeze §2). */
export interface UpdateBindingCommand extends EditorCommandBase {
	readonly type: "binding.update";
	readonly binding: BindingV1;
}

/** The atomic command union (DD-0019 §10.1; 20 members, frozen). */
export type AtomicEditorCommand =
	| SetNodeLayoutCommand
	| SetNodeStyleCommand
	| SetNodeTypographyCommand
	| SetNodeVisibilityCommand
	| SetNodeLockCommand
	| RenameNodeCommand
	| SetResponsiveOverrideCommand
	| SetBreakpointsCommand
	| CreateStyleDefinitionCommand
	| AttachStyleDefinitionCommand
	| CreateTokenCommand
	| UpdateTokenCommand
	| CreateComponentDefinitionCommand
	| DeleteComponentDefinitionCommand
	| DetachComponentInstanceCommand
	| DetachAllComponentInstancesCommand
	| ResetComponentOverrideCommand
	| ResetAllComponentOverridesCommand
	| PromoteComponentOverrideCommand
	| CreateInteractionCommand
	| UpdateBindingCommand;

/**
 * A batch: one transaction, one history-recording dispatch. Members
 * validate sequentially against the intermediate state produced by
 * their predecessors; commit is all-or-nothing; only the batch-level
 * `expectedRevision` is compared; a committed batch increments the
 * revision by exactly 1 (freeze §5). No nesting; ≤200 members.
 */
export interface BatchEditorCommand extends EditorCommandBase {
	readonly type: "batch";
	readonly label: string;
	readonly commands: readonly AtomicEditorCommand[];
}

/** Any editor command (DD-0019 §10.1, verbatim). */
export type EditorCommand = AtomicEditorCommand | BatchEditorCommand;

/**
 * Multi-selection state (DD-0019 §10.6, verbatim). Core stores the
 * full selection; the primary id is synchronized to Puck. Locked
 * nodes may be selected and copied but not mutated; selections cannot
 * span component editing scopes. Never undoable.
 */
export interface EditorSelectionState {
	readonly primaryId?: string;
	readonly selectedIds: readonly string[];
	readonly anchorId?: string;
	readonly scope: "page" | `component:${string}`;
}

/** Result of an executed command (DD-0019 §10.2, verbatim). */
export interface EditorCommandResult {
	readonly status: "committed" | "rejected" | "noop";
	readonly revision: number;
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

/**
 * The read snapshot handed to command producers (UI, plugins, AI):
 * everything needed to build and validate a command against the
 * current document.
 */
export interface EditorCommandSnapshot {
	readonly revision: number;
	readonly authoring: AuthoringStateV1;
	readonly selection: EditorSelectionState;
	readonly breakpoints: readonly BreakpointDefinition[];
}

/** Result of a dry-run `preview()` (no dispatch, no history). */
export interface EditorPreviewResult {
	readonly valid: boolean;
	readonly errors: readonly EditorError[];
	readonly changedNodeIds: readonly string[];
}

/**
 * The typed command port (DD-0019 §10.2, verbatim) — the single
 * mutation entry point shared by UI, plugins, and AI. `execute`
 * performs at most one history-recording Puck dispatch per intent
 * (single-intent history rule, §10.5).
 */
export interface EditorCommandPort {
	execute(command: EditorCommand): Promise<EditorCommandResult>;
	preview(command: EditorCommand): EditorPreviewResult;
	validate(command: EditorCommand): readonly EditorError[];
	getSnapshot(): EditorCommandSnapshot;
}
