/**
 * @file `StudioPluginContext.editor` — the additive plugin-facing
 * editor API (DD-0019 §21.1; PLAN-0020 CORE-P1A-003; DD-DEC-014).
 *
 * Pure type module (zero runtime JS), like every `src/types/*`
 * sibling: the shapes here are implemented by
 * `src/react/editor/` (capability registry, plugin facade) and
 * referenced type-only from the plugin contract. Plugins receive the
 * typed command port and read-only projections — never raw store
 * handles (the store-isolation invariant in `plugin-context.ts`).
 */

import type {
	AnvilComponentMetadata,
	EditorDiagnosticPort,
	EditorFeatureId,
	EditorSelectionState,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandPort,
} from "../editor/legacy/index.js";

/**
 * Capability lookup over the live document and config
 * (DD-0019 §21.1): what the editor may do per component type and per
 * node, plus which editor features the current document uses.
 */
export interface EditorCapabilityRegistry {
	/**
	 * The declared `metadata.editor` capability metadata for a component
	 * type; `undefined` for legacy components (≡ `styleTarget: "none"`).
	 */
	forComponent(componentType: string): AnvilComponentMetadata | undefined;
	/** {@link forComponent} resolved through a node's component type. */
	forNode(nodeId: string): AnvilComponentMetadata | undefined;
	/**
	 * The editor features the current document uses (sidecar-visible
	 * set — the same projection exporter preflight consumes).
	 */
	listUsedFeatures(): readonly EditorFeatureId[];
}

/** Read-only selection projection for plugins (no mutation surface). */
export interface EditorSelectionReader {
	/** The current selection snapshot (DD-0019 §10.6). */
	getState(): EditorSelectionState;
	/** Subscribe to selection changes. Returns an unsubscribe fn. */
	subscribe(listener: (state: EditorSelectionState) => void): () => void;
}

/**
 * The optional `editor` member of `StudioPluginContext`
 * (DD-0019 §21.1, verbatim): present exactly when the host enabled
 * the visual editor (`StudioProps.editor.features.enabled === true`).
 * Commands issued here flow through the same single mutation path as
 * the UI (`source: "plugin"`, one history entry per intent); before
 * the lazily-loaded editor runtime finishes mounting, `commands`
 * rejects writes deterministically instead of throwing.
 */
export interface StudioPluginEditorApi {
	readonly version: "1";
	/** The typed command port — the single mutation entry point. */
	readonly commands: EditorCommandPort;
	/** Read-only multi-selection state. */
	readonly selection: EditorSelectionReader;
	/** Capability metadata lookup. */
	readonly capabilities: EditorCapabilityRegistry;
	/** Persistent diagnostics + content-free operational events. */
	readonly diagnostics: EditorDiagnosticPort;
}
