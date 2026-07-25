/**
 * @file Instance detach (PLAN-0020 CORE-P2-006; ED-COMP-004;
 * DD-0019 §14.4; ADR 0005 "detach materializes with new IDs, no
 * visual change").
 *
 * Detach materializes the resolved instance into ordinary page nodes
 * with **fresh ids**, drops the instance reference, and carries the
 * resolved authoring across so the result is visually identical. It
 * is a joint `(PuckData, AuthoringStateV1)` reduction (freeze D-3),
 * committed by the React layer through one `setData` — one undo step.
 *
 * Fresh ids matter for correctness, not tidiness: the materialized
 * nodes previously existed only as runtime ids
 * (`${instanceNodeId}::${definitionNodeId}`), which §14.2 forbids
 * persisting. Reusing them would leak the runtime namespace into the
 * document and collide the moment a second instance detached.
 */

import type {
	AuthoringStateV1,
	NodeAuthoringStateV1,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { withRecord } from "../node-records.js";
import {
	indexNodeLocations,
	isComponentNode,
	transformContainers,
} from "../tree/nodes.js";
import { type MaterializeResult, materializeInstance } from "./materialize.js";

/** The result of detaching one or more instances. */
export interface DetachPlan {
	readonly data: PuckData;
	readonly authoring: AuthoringStateV1;
	/** Detached instance node id → the new root node id replacing it. */
	readonly replacements: Readonly<Record<string, string>>;
}

/** Why a detach could not be performed. */
export interface DetachFailure {
	readonly instanceNodeId: string;
	readonly reason: MaterializeResult;
}

function isNode(value: unknown): value is SerializablePuckNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

/**
 * Rewrite a materialized subtree's runtime ids to fresh ids,
 * recording the mapping so the resolved authoring can follow.
 */
function freshenIds(
	node: SerializablePuckNode,
	generateId: (type: string) => string,
	idMap: Record<string, string>,
): SerializablePuckNode {
	const props: Record<string, unknown> = { ...node.props };
	const runtimeId = node.props.id;
	if (typeof runtimeId === "string" && runtimeId.length > 0) {
		const fresh = generateId(node.type);
		idMap[runtimeId] = fresh;
		props.id = fresh;
	}
	for (const [key, value] of Object.entries(node.props)) {
		if (Array.isArray(value) && value.some(isNode)) {
			props[key] = value.map((entry) =>
				isNode(entry) ? freshenIds(entry, generateId, idMap) : entry,
			);
		}
	}
	return { type: node.type, props: props as SerializablePuckNode["props"] };
}

/**
 * Build the detach reduction for `instanceNodeIds`.
 *
 * Returns `null` when nothing applies; a `DetachFailure` when an
 * instance cannot be materialized (unresolvable definition, cycle, or
 * depth) — per the freeze, detach of an unresolvable instance
 * **rejects** rather than half-succeeding, leaving the instance data
 * untouched (ED-COMP-007).
 */
export function buildDetachPlan(
	data: PuckData,
	authoring: AuthoringStateV1,
	instanceNodeIds: readonly string[],
	generateId: (type: string) => string,
): DetachPlan | DetachFailure | null {
	const locations = indexNodeLocations(data);
	const targets = instanceNodeIds.filter(
		(id) =>
			locations.has(id) && authoring.nodes[id]?.componentInstance !== undefined,
	);
	if (targets.length === 0) {
		return null;
	}

	const materializedByInstance = new Map<string, SerializablePuckNode>();
	const replacements: Record<string, string> = {};
	let nextAuthoring = authoring;

	for (const instanceNodeId of targets) {
		const instance = authoring.nodes[instanceNodeId]?.componentInstance;
		if (instance === undefined) {
			continue;
		}
		const result = materializeInstance(
			instanceNodeId,
			instance,
			authoring.componentDefinitions,
		);
		if (result.status !== "materialized") {
			return { instanceNodeId, reason: result };
		}

		const idMap: Record<string, string> = {};
		const fresh = freshenIds(result.node, generateId, idMap);
		materializedByInstance.set(instanceNodeId, fresh);
		const freshRootId = fresh.props.id;
		if (typeof freshRootId === "string") {
			replacements[instanceNodeId] = freshRootId;
		}

		// Carry the resolved authoring onto the new nodes so the
		// detached result renders identically.
		for (const [runtimeId, families] of Object.entries(result.authoring)) {
			const freshId = idMap[runtimeId];
			if (freshId === undefined) {
				continue;
			}
			const record: NodeAuthoringStateV1 = {
				version: "1",
				...(families.layout !== undefined ? { layout: families.layout } : {}),
				...(families.style !== undefined ? { style: families.style } : {}),
				...(families.typography !== undefined
					? { typography: families.typography }
					: {}),
				...(families.hidden !== undefined ? { hidden: families.hidden } : {}),
			};
			nextAuthoring = withRecord(nextAuthoring, freshId, record);
		}

		// The instance record goes; any non-instance authoring on the
		// instance node (name, lock) moves to the new root node.
		const instanceRecord = nextAuthoring.nodes[instanceNodeId];
		if (instanceRecord !== undefined && typeof freshRootId === "string") {
			const { componentInstance: _dropped, ...rest } = instanceRecord;
			const existing = nextAuthoring.nodes[freshRootId] ?? { version: "1" };
			nextAuthoring = withRecord(nextAuthoring, freshRootId, {
				...rest,
				...existing,
				version: "1",
			});
		}
		nextAuthoring = withRecord(nextAuthoring, instanceNodeId, { version: "1" });
	}

	const nextData = transformContainers(data, (items) => {
		if (
			!items.some(
				(entry) =>
					isComponentNode(entry) &&
					typeof entry.props.id === "string" &&
					materializedByInstance.has(entry.props.id),
			)
		) {
			return items;
		}
		const next: unknown[] = [];
		for (const entry of items) {
			if (
				isComponentNode(entry) &&
				typeof entry.props.id === "string" &&
				materializedByInstance.has(entry.props.id)
			) {
				next.push(materializedByInstance.get(entry.props.id));
				continue;
			}
			next.push(entry);
		}
		return next;
	});

	return { data: nextData, authoring: nextAuthoring, replacements };
}

/** Narrow a {@link buildDetachPlan} result to a failure. */
export function isDetachFailure(
	value: DetachPlan | DetachFailure | null,
): value is DetachFailure {
	return value !== null && "reason" in value;
}
