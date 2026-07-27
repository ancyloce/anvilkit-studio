/**
 * @file Interaction reference resolution (PLAN-0020 CORE-P3-001;
 * DD-0019 §16, §25; ED-INT-001).
 *
 * An interaction points at nodes — its source, and the targets of
 * `scroll`, `visibility` and `variant` actions. Those references can
 * dangle: the author deletes the target, a collaborator removes it, or
 * a component definition becomes unavailable.
 *
 * **A dangling reference disables the interaction; it never rejects
 * the document and never deletes the interaction.** That follows the
 * retention rule Phase 2 established for orphaned overrides (§14.6,
 * CFX-C09): tampered or stale references stay as diagnosable data so
 * the author can repair them, because silently dropping an
 * interaction is indistinguishable from it never having existed.
 *
 * Resolution lives here rather than in `interactionCreateErrors`
 * because node existence is not knowable from `AuthoringStateV1`
 * alone — authoring records exist only for nodes with non-default
 * state (invariant 3), so "no record" does not mean "no node". Only a
 * caller holding the Puck tree can answer that, which is why
 * {@link resolveInteraction} takes an existence predicate instead of
 * reading state.
 */

import type {
	InteractionAction,
	InteractionV1,
} from "@anvilkit/contracts/editor";

/** A reference an interaction makes to a node in the tree. */
export interface InteractionReference {
	/** `"source"`, or the index of the action that carries it. */
	readonly origin: "source" | number;
	readonly nodeId: string;
}

/** The outcome of resolving one interaction's references. */
export interface ResolvedInteraction {
	readonly interaction: InteractionV1;
	/**
	 * Whether the interaction should run. False when the author
	 * disabled it **or** when any reference dangles — the stored
	 * `enabled` flag is never rewritten, so re-adding the missing node
	 * restores the interaction with no repair step.
	 */
	readonly effectiveEnabled: boolean;
	/** References that resolved to nothing, in document order. */
	readonly missingReferences: readonly InteractionReference[];
}

/** Node references carried by one action, if any. */
function actionReference(action: InteractionAction): string | undefined {
	switch (action.type) {
		case "scroll":
		case "visibility":
		case "variant":
			return action.targetNodeId;
		default:
			// `navigate` addresses a host page, not a node; `url` leaves the
			// document entirely; `animate` is handled separately because it
			// carries many targets.
			return undefined;
	}
}

/** Every node reference an interaction makes, in document order. */
export function interactionReferences(
	interaction: InteractionV1,
): readonly InteractionReference[] {
	const references: InteractionReference[] = [
		{ origin: "source", nodeId: interaction.sourceNodeId },
	];
	interaction.actions.forEach((action, index) => {
		if (action.type === "animate") {
			for (const nodeId of action.targetNodeIds) {
				references.push({ origin: index, nodeId });
			}
			return;
		}
		const nodeId = actionReference(action);
		if (nodeId !== undefined) references.push({ origin: index, nodeId });
	});
	return references;
}

/**
 * Resolve an interaction's references against the live tree.
 *
 * `nodeExists` is supplied by the caller (the command port holds the
 * Puck tree); this module stays pure and React-free.
 */
export function resolveInteraction(
	interaction: InteractionV1,
	nodeExists: (nodeId: string) => boolean,
): ResolvedInteraction {
	const missingReferences = interactionReferences(interaction).filter(
		(reference) => !nodeExists(reference.nodeId),
	);
	return {
		interaction,
		effectiveEnabled: interaction.enabled && missingReferences.length === 0,
		missingReferences,
	};
}

/**
 * Resolve every interaction in a document.
 *
 * Returned in insertion order so diagnostics are stable across runs —
 * an unstable order would make the export preflight's output churn
 * between otherwise identical documents.
 */
export function resolveInteractions(
	interactions: Readonly<Record<string, InteractionV1>>,
	nodeExists: (nodeId: string) => boolean,
): readonly ResolvedInteraction[] {
	return Object.values(interactions).map((interaction) =>
		resolveInteraction(interaction, nodeExists),
	);
}
