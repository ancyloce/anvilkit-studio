/**
 * @file Component-definition lifecycle (PLAN-0020 CORE-P2-007;
 * ED-COMP-006/007; DD-0019 §14.6; contract freeze CORE-P0-001 §3.1,
 * §4).
 *
 * Two behaviours this file owns:
 *
 * - **Deletion policy.** `"confirm-detach-all"` (default) lets a
 *   delete through only when nothing references the definition; the
 *   UI turns a referenced delete into cancel or a detach-all→delete
 *   transaction. `"block-when-referenced"` additionally makes that
 *   transaction impossible — its check runs against the
 *   **batch-entry** state, so a batch cannot detach-all first and
 *   sneak the delete past on the intermediate state (freeze §4).
 * - **Retention (ED-COMP-007).** An unresolvable definition never
 *   causes instance data to be rewritten or dropped. Instances keep
 *   their reference, variant selection, and overrides; they render
 *   the §25 placeholder; and because materialization resolves by id
 *   on every read, they re-resolve automatically the moment the
 *   definition returns. There is deliberately **no** "repair" pass —
 *   the absence of one is the feature.
 */

import type {
	ComponentDefinitionDeletePolicy,
	ComponentDefinitionId,
	EditorError,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { makeEditorError } from "../diagnostics.js";

/** How many referencing node ids a diagnostic carries (freeze §4). */
const INSTANCE_ID_REPORT_CAP = 50;

/** Live instances of one definition. */
export interface DefinitionUsage {
	readonly count: number;
	/** Referencing node ids, capped at 50 for the diagnostic payload. */
	readonly instanceNodeIds: readonly string[];
}

/**
 * Count instances referencing `definitionId`, document-wide.
 *
 * Page-scope instances live in `nodes[*].componentInstance`; nested
 * instances inside other definitions' roots are counted separately by
 * the detach-all path, which walks definition trees.
 */
export function countLiveInstances(
	state: AuthoringStateV1,
	definitionId: ComponentDefinitionId,
): DefinitionUsage {
	const instanceNodeIds: string[] = [];
	let count = 0;
	for (const [nodeId, record] of Object.entries(state.nodes)) {
		if (record.componentInstance?.definitionId !== definitionId) {
			continue;
		}
		count += 1;
		if (instanceNodeIds.length < INSTANCE_ID_REPORT_CAP) {
			instanceNodeIds.push(nodeId);
		}
	}
	return { count, instanceNodeIds };
}

/**
 * Validate a definition delete under the host policy.
 *
 * @param state the state the command reduces against (intermediate
 *   inside a batch)
 * @param entryState the state the transaction began at — what
 *   `"block-when-referenced"` judges, so no single transaction can
 *   take a referenced definition to deleted (freeze §4)
 */
export function validateDefinitionDelete(
	state: AuthoringStateV1,
	definitionId: ComponentDefinitionId,
	policy: ComponentDefinitionDeletePolicy,
	entryState: AuthoringStateV1 = state,
): readonly EditorError[] {
	if (state.componentDefinitions[definitionId] === undefined) {
		return [
			makeEditorError(
				"EDITOR_DEFINITION_UNAVAILABLE",
				`component definition "${definitionId}" is not in this document`,
				{ details: { kind: "componentDefinition", definitionId } },
			),
		];
	}

	const judged =
		policy === "block-when-referenced"
			? countLiveInstances(entryState, definitionId)
			: countLiveInstances(state, definitionId);

	if (judged.count === 0) {
		return [];
	}
	return [
		makeEditorError(
			"EDITOR_DEFINITION_REFERENCED",
			`component definition "${definitionId}" still has ${judged.count} live instance(s)`,
			{
				nodeIds: judged.instanceNodeIds,
				details: {
					kind: "componentDefinition",
					definitionId,
					policy,
					instanceCount: judged.count,
					instanceNodeIds: judged.instanceNodeIds,
				},
			},
		),
	];
}

/**
 * Remove a definition from the sidecar. Instance records are left
 * exactly as they are: dropping them here would destroy the
 * ED-COMP-007 retention guarantee, and any instance that should have
 * gone was already detached by the transaction that precedes this.
 */
export function deleteDefinition(
	state: AuthoringStateV1,
	definitionId: ComponentDefinitionId,
): AuthoringStateV1 {
	if (state.componentDefinitions[definitionId] === undefined) {
		return state;
	}
	const componentDefinitions = { ...state.componentDefinitions };
	delete componentDefinitions[definitionId];
	return { ...state, componentDefinitions };
}

/** An instance whose definition cannot currently be resolved. */
export interface UnresolvedInstance {
	readonly nodeId: string;
	readonly definitionId: ComponentDefinitionId;
}

/**
 * Instances pointing at a definition this document does not have
 * (ED-COMP-007). These render the §25 placeholder with a
 * library-unavailable reason; their data stays untouched.
 */
export function collectUnresolvedInstances(
	state: AuthoringStateV1,
): readonly UnresolvedInstance[] {
	const unresolved: UnresolvedInstance[] = [];
	for (const [nodeId, record] of Object.entries(state.nodes)) {
		const instance = record.componentInstance;
		if (
			instance !== undefined &&
			state.componentDefinitions[instance.definitionId] === undefined
		) {
			unresolved.push({ nodeId, definitionId: instance.definitionId });
		}
	}
	return unresolved;
}

/** Unresolvable instances as user-facing diagnostics. */
export function unresolvedInstanceDiagnostics(
	state: AuthoringStateV1,
): readonly EditorError[] {
	return collectUnresolvedInstances(state).map((entry) =>
		makeEditorError(
			"EDITOR_DEFINITION_UNAVAILABLE",
			`component definition "${entry.definitionId}" is unavailable; the instance is retained and will re-resolve if it returns`,
			{
				severity: "warning",
				nodeIds: [entry.nodeId],
				details: {
					kind: "componentDefinition",
					definitionId: entry.definitionId,
					reason: "library-unavailable",
				},
			},
		),
	);
}
