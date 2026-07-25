/**
 * @file Instance-mode editing and orphan diagnostics (PLAN-0020
 * CORE-P2-006; ED-COMP-002/003; DD-0019 §14.2, §14.4).
 *
 * Instance edits are sidecar-only: exposed-property overrides and
 * node overrides live on the instance's authoring record, and the
 * rendered result changes because `materializeInstance` reads them —
 * **no per-instance copy of the definition exists**. That is what
 * makes definition edits propagate for free (ED-COMP-002) and keeps
 * document size independent of instance count (CFX-C01/C08).
 *
 * Override keys are always **bare definition node ids**, never the
 * runtime composite `${instanceNodeId}::${definitionNodeId}` form
 * (§14.2); a dev invariant guards the distinction.
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	ComponentInstanceState,
	EditorError,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import { withRecord } from "../node-records.js";

/** Every node id declared inside a definition's root subtree. */
export function collectDefinitionNodeIds(
	definition: ComponentDefinitionV1,
): ReadonlySet<string> {
	const ids = new Set<string>();
	const walk = (node: SerializablePuckNode): void => {
		const id = node.props.id;
		if (typeof id === "string" && id.length > 0) {
			ids.add(id);
		}
		for (const value of Object.values(node.props)) {
			if (!Array.isArray(value)) {
				continue;
			}
			for (const entry of value) {
				if (
					typeof entry === "object" &&
					entry !== null &&
					!Array.isArray(entry) &&
					typeof (entry as { type?: unknown }).type === "string"
				) {
					walk(entry as unknown as SerializablePuckNode);
				}
			}
		}
	};
	walk(definition.root);
	return ids;
}

function instanceOf(
	state: AuthoringStateV1,
	instanceNodeId: string,
): ComponentInstanceState | undefined {
	return state.nodes[instanceNodeId]?.componentInstance;
}

function withInstance(
	state: AuthoringStateV1,
	instanceNodeId: string,
	next: ComponentInstanceState,
): AuthoringStateV1 {
	const record = state.nodes[instanceNodeId];
	if (record === undefined) {
		return state;
	}
	return withRecord(state, instanceNodeId, {
		...record,
		componentInstance: next,
	});
}

/**
 * Set or clear one exposed-property override. `null` clears, so the
 * property falls back to the definition's declared default.
 */
export function setPropOverride(
	state: AuthoringStateV1,
	instanceNodeId: string,
	propId: string,
	value: JsonValue | null,
): AuthoringStateV1 {
	const instance = instanceOf(state, instanceNodeId);
	if (instance === undefined) {
		return state;
	}
	const has = Object.hasOwn(instance.propOverrides, propId);
	if (value === null) {
		if (!has) {
			return state;
		}
		const propOverrides = { ...instance.propOverrides };
		delete propOverrides[propId];
		return withInstance(state, instanceNodeId, { ...instance, propOverrides });
	}
	if (has && instance.propOverrides[propId] === value) {
		return state;
	}
	return withInstance(state, instanceNodeId, {
		...instance,
		propOverrides: { ...instance.propOverrides, [propId]: value },
	});
}

/** Set or clear one instance node override (bare definition node id). */
export function setNodeOverride(
	state: AuthoringStateV1,
	instanceNodeId: string,
	definitionNodeId: string,
	patch: NodeOverridePatch | null,
): AuthoringStateV1 {
	const instance = instanceOf(state, instanceNodeId);
	if (instance === undefined) {
		return state;
	}
	const has = Object.hasOwn(instance.nodeOverrides, definitionNodeId);
	if (patch === null) {
		if (!has) {
			return state;
		}
		const nodeOverrides = { ...instance.nodeOverrides };
		delete nodeOverrides[definitionNodeId];
		return withInstance(state, instanceNodeId, { ...instance, nodeOverrides });
	}
	return withInstance(state, instanceNodeId, {
		...instance,
		nodeOverrides: { ...instance.nodeOverrides, [definitionNodeId]: patch },
	});
}

/** One override whose target definition node no longer exists. */
export interface OrphanOverride {
	readonly instanceNodeId: string;
	readonly definitionId: string;
	readonly definitionNodeId: string;
}

/**
 * Find overrides whose target definition node has been removed
 * (ED-COMP-003; ADR 0005 "orphan overrides are diagnosable data").
 *
 * Orphans are **retained, never silently dropped and never reapplied
 * elsewhere** — materialization simply finds no node to match, so the
 * data sits inert until either the node returns (the override
 * reactivates) or the user clears it from this diagnostic.
 */
export function collectOrphanOverrides(
	state: AuthoringStateV1,
): readonly OrphanOverride[] {
	const orphans: OrphanOverride[] = [];
	const nodeIdCache = new Map<string, ReadonlySet<string>>();
	for (const [instanceNodeId, record] of Object.entries(state.nodes)) {
		const instance = record.componentInstance;
		if (instance === undefined) {
			continue;
		}
		const definition = state.componentDefinitions[instance.definitionId];
		if (definition === undefined) {
			// Unresolvable definition is a *different* condition
			// (ED-COMP-007 retention), not an orphan override.
			continue;
		}
		let ids = nodeIdCache.get(instance.definitionId);
		if (ids === undefined) {
			ids = collectDefinitionNodeIds(definition);
			nodeIdCache.set(instance.definitionId, ids);
		}
		for (const definitionNodeId of Object.keys(instance.nodeOverrides)) {
			if (!ids.has(definitionNodeId)) {
				orphans.push({
					instanceNodeId,
					definitionId: instance.definitionId,
					definitionNodeId,
				});
			}
		}
	}
	return orphans;
}

/** Orphan overrides as user-facing diagnostics. */
export function orphanOverrideDiagnostics(
	state: AuthoringStateV1,
): readonly EditorError[] {
	return collectOrphanOverrides(state).map((orphan) =>
		makeEditorError(
			"EDITOR_NODE_NOT_FOUND",
			`override targets definition node "${orphan.definitionNodeId}", which no longer exists in "${orphan.definitionId}"`,
			{
				severity: "warning",
				nodeIds: [orphan.instanceNodeId],
				details: {
					kind: "orphanOverride",
					definitionId: orphan.definitionId,
					definitionNodeId: orphan.definitionNodeId,
				},
			},
		),
	);
}
