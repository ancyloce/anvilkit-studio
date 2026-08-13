"use client";

/**
 * @file `useNodeInteractions` — the Interactions panel's state, on the
 * canonical read/commit path (PLAN-0028 `p4-002`, PLAN-0026 §3.5).
 *
 * A rebase of `react/editor/interactions/use-interactions.ts`, not a
 * rewrite: the same rows, the same target picker, the same variant-axis
 * lookup, the same "an interaction belongs to the element that triggers
 * it" scoping. What changes is where the two halves come from.
 *
 * - **Reads** are `useDocumentModel()`. The old hook read the sidecar's
 *   `authoring.interactions` and then had to consult the live tree
 *   separately — through `bridge.port.readData()`, an internal member —
 *   because the sidecar could not answer which nodes exist. The read
 *   model answers both from one projection of `appState.data`: the
 *   node's declared `interactions` carrier, and `model.nodes` as the
 *   authority on node existence. That deletes the port cast, the
 *   `try`/`catch` around it, and the "unreadable tree" degradation with
 *   it, because there is no second source left to fail.
 * - **Writes** are {@link useInteractionsCommit}. One intent is one
 *   functional `setData` with `recordHistory: true`, so an edit is one
 *   undo — the same guarantee the old command dispatch gave, now
 *   without a command port.
 *
 * **Holds no node state.** Every value below is derived from the model
 * on each render; the only `useState` is the last commit's errors,
 * which are editor feedback and not document state.
 *
 * **Capability gating is the compiler's.** `declared` reads
 * `metadata.anvilkit.editor.interactions` through the shared
 * `readEditorMetadataFor`, the same module `updateInteractionsInData`
 * checks before it will write. The panel therefore cannot offer a
 * control whose commit would be rejected (§8.5 — the host may not
 * fabricate support).
 */

import type {
	Interaction,
	InteractionAction,
	InteractionTrigger,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { useCallback, useMemo, useState } from "react";
import { randomId } from "@/shared/node-id";
import { resolveInteraction } from "../../../../editor/index.js";
import { readEditorMetadataFor } from "../../../../puck/component-metadata.js";
import { useDocumentModel } from "../../use-document-model.js";
import { useInteractionsCommit } from "../use-carrier-commits.js";
import { useShellSelection } from "../use-shell-selection.js";

/** A node offered by the action target picker. */
export interface InteractionTargetOption {
	readonly id: string;
	/**
	 * `"Hero · a1b2c3"` — type plus a short id, which is what an author
	 * recognises in a list.
	 */
	readonly label: string;
}

/** One interaction as the panel renders it. */
export interface NodeInteractionRow {
	readonly interaction: Interaction;
	/**
	 * False when the author disabled it or a reference dangles. The
	 * stored flag is never rewritten — see `editor/interactions/resolve.ts`.
	 */
	readonly effectiveEnabled: boolean;
	/** Node ids this interaction points at that no longer exist. */
	readonly missingNodeIds: readonly string[];
}

/** What the Interactions panel needs. */
export interface NodeInteractionsState {
	/** The primary selection, or `null` when nothing is selected. */
	readonly nodeId: string | null;
	/**
	 * Whether the selected component declares the `interactions`
	 * carrier. `false` means the panel must show its empty state rather
	 * than a control that would be rejected on commit.
	 */
	readonly declared: boolean;
	readonly rows: readonly NodeInteractionRow[];
	/** Nodes in the document, for the action's target picker. */
	readonly targets: readonly InteractionTargetOption[];
	/**
	 * Variant axes declared by the component instance at `nodeId`, or an
	 * empty list when it is not an instance — a `variant` action is only
	 * meaningful against one.
	 */
	readonly variantAxesFor: (nodeId: string) => readonly VariantAxis[];
	/** Errors from the most recent commit, for inline display. */
	readonly lastErrors: readonly string[];
	/** Attach an interaction to the selected node. */
	readonly addInteraction: (
		name: string,
		trigger: InteractionTrigger,
		action: InteractionAction,
	) => void;
	/** Replace one interaction in place — rename, reorder, add action. */
	readonly replaceInteraction: (next: Interaction) => void;
	readonly removeInteraction: (interactionId: string) => void;
}

const NO_ROWS: readonly NodeInteractionRow[] = Object.freeze([]);
const NO_AXES: readonly VariantAxis[] = Object.freeze([]);
const NO_ERRORS: readonly string[] = Object.freeze([]);

/** Interactions whose owner is the primary selection. */
export function useNodeInteractions(): NodeInteractionsState {
	const model = useDocumentModel();
	const { primaryId } = useShellSelection();
	const commit = useInteractionsCommit();
	const [lastErrors, setLastErrors] = useState<readonly string[]>(NO_ERRORS);

	const node = primaryId === null ? undefined : model.nodes.get(primaryId);
	const declared =
		node !== undefined &&
		readEditorMetadataFor(model.config, node.type)?.interactions === true;

	const rows = useMemo((): readonly NodeInteractionRow[] => {
		if (node === undefined || node.interactions.length === 0) return NO_ROWS;
		// The projection is the authority on node existence, so a dangling
		// reference is detected against the same tree the exporter reads.
		const nodeExists = (nodeId: string): boolean => model.nodes.has(nodeId);
		return node.interactions.map((interaction) => {
			// Reuses the engine resolver so the panel and the export
			// preflight can never disagree about what "enabled" means.
			const resolved = resolveInteraction(interaction, nodeExists);
			return {
				interaction,
				effectiveEnabled: resolved.effectiveEnabled,
				missingNodeIds: resolved.missingReferences.map(
					(reference) => reference.nodeId,
				),
			};
		});
	}, [model, node]);

	const targets = useMemo(
		(): readonly InteractionTargetOption[] =>
			[...model.nodes.values()].map((entry) => ({
				id: entry.id,
				label: `${entry.type} · ${entry.id.slice(0, 6)}`,
			})),
		[model],
	);

	const variantAxesFor = useCallback(
		(nodeId: string): readonly VariantAxis[] => {
			const instance = model.nodes.get(nodeId)?.componentInstance;
			if (instance === undefined) return NO_AXES;
			return (
				model.componentLibrary?.definitions[instance.definitionId]
					?.variantAxes ?? NO_AXES
			);
		},
		[model],
	);

	/** One commit, one history entry; errors surface, never throw. */
	const apply = useCallback(
		(update: (current: readonly Interaction[]) => readonly Interaction[]) => {
			if (primaryId === null) return;
			const result = commit(primaryId, update);
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: NO_ERRORS,
			);
		},
		[commit, primaryId],
	);

	const addInteraction = useCallback(
		(
			name: string,
			trigger: InteractionTrigger,
			action: InteractionAction,
		): void => {
			if (primaryId === null) return;
			const interaction: Interaction = {
				version: "1",
				id: randomId(),
				name,
				// The carrier lives on the node's own props, so the source is
				// the owner by construction — but §16 declares the member, so
				// it is written rather than left to be inferred.
				sourceNodeId: primaryId,
				enabled: true,
				trigger,
				actions: [action],
			};
			apply((current) => [...current, interaction]);
		},
		[apply, primaryId],
	);

	const replaceInteraction = useCallback(
		(next: Interaction): void => {
			apply((current) =>
				current.map((entry) => (entry.id === next.id ? next : entry)),
			);
		},
		[apply],
	);

	const removeInteraction = useCallback(
		(interactionId: string): void => {
			apply((current) => current.filter((entry) => entry.id !== interactionId));
		},
		[apply],
	);

	return {
		nodeId: primaryId,
		declared,
		rows,
		targets,
		variantAxesFor,
		lastErrors,
		addInteraction,
		replaceInteraction,
		removeInteraction,
	};
}
