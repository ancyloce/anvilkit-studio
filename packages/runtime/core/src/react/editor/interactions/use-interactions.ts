"use client";

/**
 * @file `useNodeInteractions` — the inspector's view of the
 * interactions attached to the selected node (PLAN-0020 CORE-P3-001;
 * ED-INT-001/002; DD-0019 §16).
 *
 * Reads the sidecar's interaction map, resolves each one's references
 * against the live Puck tree, and exposes a create action that goes
 * through the ordinary command port — so an interaction is one
 * history-recording dispatch like every other edit.
 *
 * Engine helpers are imported statically, matching `field-state.ts`
 * and `use-component-canvas.ts`: this hook ships inside the lazily
 * loaded inspector chunk, so its bytes never reach the `<Studio>`
 * entry chunk (§28) — verified against the budget gate.
 */

import type {
	InteractionAction,
	InteractionTrigger,
	Interaction,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandResult,
} from "../../../editor/legacy/index.js";
import { useCallback, useMemo, useState } from "react";
import {
	indexNodeLocations,
	resolveInteraction,
} from "../../../editor/index.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";

/** A node offered by the action target picker. */
export interface InteractionTargetOption {
	readonly id: string;
	/** `"Hero · a1b2c3"` — type plus a short id, which is what an
	 * author recognises in a list. */
	readonly label: string;
}

/** One interaction as the inspector renders it. */
export interface NodeInteractionRow {
	readonly interaction: Interaction;
	/**
	 * False when the author disabled it or a reference dangles. The
	 * stored flag is never rewritten — see `interactions/resolve.ts`.
	 */
	readonly effectiveEnabled: boolean;
	/** Node ids this interaction points at that no longer exist. */
	readonly missingNodeIds: readonly string[];
}

/** What the interactions section needs from the editor. */
export interface NodeInteractionsState {
	readonly rows: readonly NodeInteractionRow[];
	/**
	 * Attach an interaction to the selected node.
	 *
	 * Takes a fully-formed action rather than URL-specific arguments:
	 * §16 declares six action families and the editor offers all of
	 * them, so a per-family signature would not scale.
	 */
	readonly createInteraction: (
		name: string,
		trigger: InteractionTrigger,
		action: InteractionAction,
	) => Promise<EditorCommandResult | null>;
	/** Replace an interaction — used by rename and timeline reorder. */
	readonly updateInteraction: (
		interaction: Interaction,
	) => Promise<EditorCommandResult | null>;
	/** Remove an interaction. */
	readonly deleteInteraction: (
		interactionId: string,
	) => Promise<EditorCommandResult | null>;
	/** Nodes in the document, for the action's target picker. */
	readonly targets: readonly InteractionTargetOption[];
	/**
	 * Variant axes declared by the component instance at `nodeId`, or an
	 * empty list when it is not an instance — a `variant` action is only
	 * meaningful against one.
	 */
	readonly variantAxesFor: (nodeId: string) => readonly VariantAxis[];
	readonly canCreate: boolean;
	/** Errors from the most recent create attempt, for inline display. */
	readonly lastErrors: readonly string[];
}

/**
 * Interactions whose source is the primary selection.
 *
 * Scoped to the *source* node rather than every referenced node: an
 * interaction belongs to the element that triggers it, which is what
 * an author looks for when they select a button.
 */
export function useNodeInteractions(
	context: EditorInspectorContext,
): NodeInteractionsState {
	const { authoring, commands, revision, selection, bridge } = context;
	const [lastErrors, setLastErrors] = useState<readonly string[]>([]);
	const primaryId = selection.primaryId;

	const rows = useMemo((): readonly NodeInteractionRow[] => {
		if (primaryId === undefined) return [];
		// The tree is the authority on node existence; authoring records
		// exist only for non-default nodes (invariant 3), so the sidecar
		// cannot answer this on its own.
		const known = collectNodeIds(bridge);
		// An unreadable tree suppresses dangling-reference reporting
		// rather than flagging every reference as missing.
		const nodeExists = (nodeId: string): boolean =>
			known === null || known.has(nodeId);
		return Object.values(authoring.interactions)
			.filter((interaction) => interaction.sourceNodeId === primaryId)
			.map((interaction) => {
				// Reuses the engine resolver so the inspector and the export
				// preflight can never disagree about what "enabled" means.
				const resolved = resolveInteraction(interaction, nodeExists);
				return {
					interaction,
					effectiveEnabled: resolved.effectiveEnabled,
					missingNodeIds: resolved.missingReferences.map((r) => r.nodeId),
				};
			});
	}, [authoring.interactions, primaryId, bridge]);

	/**
	 * Every node in the document, labelled for a picker.
	 *
	 * Read from the tree rather than the sidecar: authoring records only
	 * exist for nodes with non-default state, so a freshly added node
	 * would be missing from a sidecar-derived list (invariant 3).
	 */
	const targets = useMemo((): readonly InteractionTargetOption[] => {
		const port = bridge.port as InternalEditorCommandPort | null | undefined;
		if (port == null) return [];
		try {
			return [...indexNodeLocations(port.readData()).entries()].map(
				([id, location]) => ({
					id,
					label: `${location.node.type} · ${id.slice(0, 6)}`,
				}),
			);
		} catch {
			return [];
		}
	}, [bridge]);

	/** Variant axes for an instance node, or `[]` when it is not one. */
	const variantAxesFor = useCallback(
		(nodeId: string): readonly VariantAxis[] => {
			const instance = authoring.nodes[nodeId]?.componentInstance;
			if (instance === undefined) return [];
			return (
				authoring.componentDefinitions[instance.definitionId]?.variantAxes ?? []
			);
		},
		[authoring.nodes, authoring.componentDefinitions],
	);

	const createInteraction = useCallback(
		async (
			name: string,
			trigger: InteractionTrigger,
			action: InteractionAction,
		): Promise<EditorCommandResult | null> => {
			if (primaryId === undefined) return null;
			const interaction: Interaction = {
				version: "1",
				id: crypto.randomUUID(),
				name,
				sourceNodeId: primaryId,
				enabled: true,
				trigger,
				actions: [action],
			};
			const result = await commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "interaction.create",
				interaction,
			});
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: [],
			);
			return result;
		},
		[commands, revision, primaryId],
	);

	const updateInteraction = useCallback(
		async (interaction: Interaction): Promise<EditorCommandResult | null> => {
			const result = await commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "interaction.update",
				interaction,
			});
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: [],
			);
			return result;
		},
		[commands, revision],
	);

	const deleteInteraction = useCallback(
		async (interactionId: string): Promise<EditorCommandResult | null> => {
			const result = await commands.execute({
				id: crypto.randomUUID(),
				expectedRevision: revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "interaction.delete",
				interactionId,
			});
			setLastErrors(
				result.status === "rejected"
					? result.errors.map((error) => error.message)
					: [],
			);
			return result;
		},
		[commands, revision],
	);

	return {
		rows,
		createInteraction,
		updateInteraction,
		deleteInteraction,
		targets,
		variantAxesFor,
		canCreate: primaryId !== undefined,
		lastErrors,
	};
}

/**
 * Every node id in the live tree, or `null` when the tree cannot be
 * read. `null` deliberately suppresses dangling-reference reporting
 * rather than flagging everything as missing — an unreadable tree is
 * an editor-state problem, and showing every interaction as broken
 * would be worse than showing none.
 */
function collectNodeIds(
	bridge: EditorInspectorContext["bridge"],
): ReadonlySet<string> | null {
	// Same cast `useCreateComponent` uses: `readData` is an internal
	// port member, deliberately absent from the public surface.
	const port = bridge.port as InternalEditorCommandPort | null | undefined;
	if (port == null) return null;
	try {
		// Reuses the engine's tree index rather than a second walker —
		// it already understands zones and root slots, which a naive
		// recursive scan gets wrong for root-level content.
		return new Set(indexNodeLocations(port.readData()).keys());
	} catch {
		return null;
	}
}
