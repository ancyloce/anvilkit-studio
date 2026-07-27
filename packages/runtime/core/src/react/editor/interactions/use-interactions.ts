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
	EditorCommandResult,
	InteractionTrigger,
	InteractionV1,
} from "@anvilkit/contracts/editor";
import { useCallback, useMemo, useState } from "react";
import {
	indexNodeLocations,
	resolveInteraction,
} from "../../../editor/index.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";

/** One interaction as the inspector renders it. */
export interface NodeInteractionRow {
	readonly interaction: InteractionV1;
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
	 * Attach a URL interaction on the given trigger. §32.4 exercises
	 * click, hover and viewport, so the trigger is a parameter rather
	 * than hard-coded to click.
	 */
	readonly createUrlInteraction: (
		name: string,
		url: string,
		trigger?: InteractionTrigger,
	) => Promise<EditorCommandResult | null>;
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

	const createUrlInteraction = useCallback(
		async (
			name: string,
			url: string,
			trigger: InteractionTrigger = { type: "click" },
		): Promise<EditorCommandResult | null> => {
			if (primaryId === undefined) return null;
			const interaction: InteractionV1 = {
				version: "1",
				id: crypto.randomUUID(),
				name,
				sourceNodeId: primaryId,
				enabled: true,
				trigger,
				actions: [{ type: "url", url }],
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

	return {
		rows,
		createUrlInteraction,
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
