/**
 * @file `EditorApi` — the public replacement for the command surface
 * (PLAN-0026 §3.4, §1 rule 5; §7 row 2).
 *
 * `StudioPluginEditorApi` exposed `EditorCommand` dispatch to plugins,
 * and `EditorCommandPort` was exported from published contracts — which
 * made its removal a real API break rather than an internal refactor.
 * The replacement is deliberately small:
 *
 * ```
 * EditorApi = { readDocument(), subscribe(), commit.* }
 * ```
 *
 * **Three surfaces and no dispatch entry point.** A fourth surface is
 * how a command port grows back, so the shape is fixed: plugins read a
 * *projection* of `Data` and write through the same commit helpers the
 * UI uses. They have no other document access (rule 1).
 *
 * Note what is deliberately absent. There is no `capabilities` lookup:
 * declared style targets are part of the projection
 * (`DocumentModel.nodes.get(id).styleTargets`), read through the one
 * canonical metadata reader, so a second capability surface would be a
 * second answer to the same question.
 */

import type { Binding, Interaction, JsonValue } from "@anvilkit/contracts/editor";
import type { DocumentModel } from "../document-model/index.js";
import type { AnnotationEdit } from "../puck/update-annotations.js";
import type { CarrierCommitResult } from "../puck/update-carriers.js";
import type { ComponentLibraryEdit } from "../puck/update-component-library.js";
import type { InstanceOverrideEdit } from "../puck/update-instance-overrides.js";
import type { TreeCommitResult } from "../puck/update-tree.js";
import type { VariantModelEdit } from "../puck/update-variants.js";

/** Outcome shared by every `EditorApi.commit.*` call. */
export interface EditorCommitOutcome {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly { readonly code: string; readonly message: string }[];
}

/**
 * The commit surface — one method per intent family, each resolving to
 * exactly one history-recording `setData`.
 */
export interface EditorCommitApi {
	readonly componentLibrary: (edit: ComponentLibraryEdit) => EditorCommitOutcome;
	readonly variantModel: (
		definitionId: string,
		edit: VariantModelEdit,
	) => EditorCommitOutcome;
	readonly instanceSelection: (
		nodeIds: readonly string[],
		selection: Readonly<Record<string, string>>,
	) => EditorCommitOutcome;
	readonly instanceOverride: (
		nodeIds: readonly string[],
		edit: InstanceOverrideEdit,
	) => EditorCommitOutcome;
	readonly interactions: (
		nodeId: string,
		update: (current: readonly Interaction[]) => readonly Interaction[],
	) => CarrierCommitResult;
	readonly bindings: (
		nodeId: string,
		update: (current: readonly Binding[]) => readonly Binding[],
	) => CarrierCommitResult;
	readonly inlineText: (input: {
		readonly nodeId: string;
		readonly targetId: string;
		readonly value: string | JsonValue;
	}) => CarrierCommitResult;
	readonly annotation: (edit: AnnotationEdit) => EditorCommitOutcome;
	readonly deleteNodes: (nodeIds: readonly string[]) => TreeCommitResult;
	readonly duplicateNodes: (nodeIds: readonly string[]) => TreeCommitResult;
}

/** The whole public editor surface for plugins and AI. */
export interface EditorApi {
	/** The current document projection. Never a mutable handle. */
	readDocument(): DocumentModel;
	/** Change notification. Returns an unsubscribe function. */
	subscribe(listener: () => void): () => void;
	readonly commit: EditorCommitApi;
}

/**
 * What an AI proposal can ask the host to do.
 *
 * **A request vocabulary, not an IR.** Every member resolves
 * immediately to exactly one commit-helper call. It has no Zod schema,
 * no serializer and no persistence path — acquiring any of those would
 * make it a parallel IR and breach rule 5, which is precisely what
 * distinguishes it from the `EditorCommand` union being deleted.
 * Document state never round-trips through an intent.
 */
export type EditorIntent =
	| {
			readonly kind: "set-inline-text";
			readonly nodeId: string;
			readonly targetId: string;
			readonly value: string;
	  }
	| {
			readonly kind: "set-interactions";
			readonly nodeId: string;
			readonly interactions: readonly Interaction[];
	  }
	| {
			readonly kind: "set-bindings";
			readonly nodeId: string;
			readonly bindings: readonly Binding[];
	  }
	| {
			readonly kind: "set-instance-variant";
			readonly nodeIds: readonly string[];
			readonly selection: Readonly<Record<string, string>>;
	  }
	| {
			readonly kind: "rename-node";
			readonly nodeId: string;
			readonly name: string;
	  }
	| { readonly kind: "delete-nodes"; readonly nodeIds: readonly string[] };

/** Outcome of resolving one intent. */
export interface EditorIntentOutcome {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly { readonly code: string; readonly message: string }[];
}
