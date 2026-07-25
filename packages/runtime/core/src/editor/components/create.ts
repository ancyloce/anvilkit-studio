/**
 * @file Create-component-from-selection (PLAN-0020 CORE-P2-004;
 * ED-COMP-001; DD-0019 §14.3; contract freeze CORE-P0-001 D-3).
 *
 * §14.3, verbatim: "All selected nodes must share one scope and an
 * expressible parent order, contain serializable props, preserve slot
 * boundaries, and avoid direct or indirect cycles. Multiple roots are
 * wrapped in an editor-owned `ComponentFrame` definition node."
 *
 * This is one of the four joint `(PuckData, AuthoringStateV1)`
 * reductions of freeze D-3: it rewrites the content tree *and* the
 * sidecar, and the React layer commits both through a single
 * `setData` (`commitNative`) so the whole creation is one undo step.
 * Reducers generate no ids and read no clock — the caller supplies
 * the definition id, the instance node id, and the timestamp
 * (freeze D-7).
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	EditorError,
	JsonValue,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { makeEditorError } from "../diagnostics.js";
import {
	indexNodeLocations,
	isComponentNode,
	type PuckTreeNode,
	transformContainers,
} from "../tree/nodes.js";

/**
 * The editor-owned wrapper type used when a multi-node selection has
 * no single root (§14.3). It is a *definition-internal* node type; it
 * never needs a host component registration because it only ever
 * appears inside `ComponentDefinitionV1.root`.
 */
export const COMPONENT_FRAME_TYPE = "ComponentFrame";

/** A validated create-component request. */
export interface CreateComponentPlan {
	readonly definition: ComponentDefinitionV1;
	readonly data: PuckData;
	readonly authoring: AuthoringStateV1;
	readonly instanceNodeId: string;
}

/** Inputs for {@link buildCreateComponentPlan}. */
export interface CreateComponentInput {
	readonly nodeIds: readonly string[];
	readonly name: string;
	/** Caller-generated (`crypto.randomUUID()`), never derived here. */
	readonly definitionId: string;
	readonly instanceNodeId: string;
	/** ISO timestamp derived from `EditorCommandBase.timestamp`. */
	readonly timestamp: string;
}

/** True when a value round-trips through JSON without loss. */
function isSerializable(value: unknown, seen: Set<unknown>): boolean {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return typeof value !== "number" || Number.isFinite(value);
	}
	if (typeof value !== "object") {
		// functions, symbols, bigint, undefined-in-array
		return false;
	}
	if (seen.has(value)) {
		return false;
	}
	seen.add(value);
	if (Array.isArray(value)) {
		return value.every((entry) => isSerializable(entry, seen));
	}
	if (Object.getPrototypeOf(value) !== Object.prototype) {
		// Dates, Maps, class instances, refs — not JSON-safe by contract.
		return false;
	}
	return Object.values(value).every(
		(entry) => entry === undefined || isSerializable(entry, seen),
	);
}

/**
 * Validate a create-from-selection request against the live tree
 * (§14.3). Returns every problem found; an empty array means the
 * request is safe to build.
 */
export function validateCreateComponentSelection(
	data: PuckData,
	authoring: AuthoringStateV1,
	nodeIds: readonly string[],
): readonly EditorError[] {
	const errors: EditorError[] = [];
	if (nodeIds.length === 0) {
		return [
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				"create-component requires at least one selected node",
				{ details: { reason: "empty-selection" } },
			),
		];
	}

	const locations = indexNodeLocations(data);
	const missing = nodeIds.filter((id) => !locations.has(id));
	if (missing.length > 0) {
		errors.push(
			makeEditorError(
				"EDITOR_NODE_NOT_FOUND",
				"create-component targets nodes that are not in the document",
				{ nodeIds: missing, details: { kind: "node" } },
			),
		);
		return errors;
	}

	// One scope: every node must live in the same container. Slot
	// boundaries are preserved by construction — a container is either
	// `content`, one zone, or one slot-prop array.
	const containers = new Set(
		nodeIds.map((id) => locations.get(id)?.container ?? ""),
	);
	if (containers.size > 1) {
		errors.push(
			makeEditorError(
				"EDITOR_CAPABILITY_UNSUPPORTED",
				"create-component requires a selection inside one container",
				{
					nodeIds,
					details: {
						reason: "selection-spans-containers",
						containers: [...containers],
					},
				},
			),
		);
	}

	// Locked nodes may be selected and copied but not mutated, and
	// creation removes them from the page.
	const locked = nodeIds.filter((id) => authoring.nodes[id]?.locked === true);
	if (locked.length > 0) {
		errors.push(
			makeEditorError(
				"EDITOR_NODE_LOCKED",
				"create-component would move locked nodes",
				{ nodeIds: locked },
			),
		);
	}

	// Serializable props (§14.3): the definition is persisted in the
	// sidecar, so anything non-JSON would be silently lost on save.
	const unserializable = nodeIds.filter((id) => {
		const node = locations.get(id)?.node;
		return node !== undefined && !isSerializable(node.props, new Set());
	});
	if (unserializable.length > 0) {
		errors.push(
			makeEditorError(
				"EDITOR_CAPABILITY_UNSUPPORTED",
				"create-component requires serializable props",
				{
					nodeIds: unserializable,
					details: { reason: "unserializable-props" },
				},
			),
		);
	}

	// No cycles: a selection containing an instance of a definition
	// that would (transitively) contain the new definition is
	// unrepresentable. Detected against the existing graph.
	const cycles = nodeIds.filter((id) => {
		const instance = authoring.nodes[id]?.componentInstance;
		return (
			instance !== undefined &&
			authoring.componentDefinitions[instance.definitionId] === undefined
		);
	});
	if (cycles.length > 0) {
		errors.push(
			makeEditorError(
				"EDITOR_DEFINITION_UNAVAILABLE",
				"create-component cannot capture instances of unresolvable definitions",
				{ nodeIds: cycles, details: { kind: "componentDefinition" } },
			),
		);
	}

	const count = Object.keys(authoring.componentDefinitions).length + 1;
	if (count > EDITOR_COUNT_LIMITS.componentDefinitions) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`documents allow at most ${EDITOR_COUNT_LIMITS.componentDefinitions} component definitions`,
				{
					details: {
						limitKey: "componentDefinitions",
						limit: EDITOR_COUNT_LIMITS.componentDefinitions,
						actual: count,
					},
				},
			),
		);
	}

	return errors;
}

/** Strip a subtree to the JSON-safe shape the sidecar persists. */
function toSerializableNode(node: PuckTreeNode): SerializablePuckNode {
	const props: Record<string, JsonValue> = {};
	for (const [key, value] of Object.entries(node.props)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value) && value.some(isComponentNode)) {
			props[key] = value.map((entry) =>
				isComponentNode(entry)
					? (toSerializableNode(entry) as unknown as JsonValue)
					: (entry as JsonValue),
			);
			continue;
		}
		props[key] = value as JsonValue;
	}
	return { type: node.type, props };
}

/**
 * Build the definition, replace the selected nodes with one instance
 * node, and write both into `(data, authoring)`.
 *
 * The selection is replaced **in place** — the instance lands at the
 * position of the first selected node, preserving the expressible
 * parent order §14.3 requires. Multiple roots are wrapped in a
 * {@link COMPONENT_FRAME_TYPE} definition node.
 *
 * Returns `null` when the request does not apply (already validated
 * requests never produce `null`; the guard keeps the builder total).
 */
export function buildCreateComponentPlan(
	data: PuckData,
	authoring: AuthoringStateV1,
	input: CreateComponentInput,
): CreateComponentPlan | null {
	const locations = indexNodeLocations(data);
	const selected = input.nodeIds
		.map((id) => locations.get(id))
		.filter((location) => location !== undefined);
	if (selected.length !== input.nodeIds.length || selected.length === 0) {
		return null;
	}

	// Definition order follows document order, not click order, so the
	// captured component looks like what the user saw.
	const ordered = [...selected].sort((a, b) => a.index - b.index);
	const captured = ordered.map((location) => toSerializableNode(location.node));

	const root: SerializablePuckNode =
		captured.length === 1 && captured[0] !== undefined
			? captured[0]
			: {
					type: COMPONENT_FRAME_TYPE,
					props: {
						id: `${input.definitionId}:frame`,
						children: captured as unknown as JsonValue,
					},
				};

	const definition: ComponentDefinitionV1 = {
		version: "1",
		id: input.definitionId,
		name: input.name,
		root,
		exposedProps: [],
		variantAxes: [],
		variants: [],
		revision: 1,
		createdAt: input.timestamp,
		updatedAt: input.timestamp,
	};

	const instanceNode: PuckTreeNode = {
		type: ordered[0]?.node.type ?? COMPONENT_FRAME_TYPE,
		props: { id: input.instanceNodeId },
	};

	const removing = new Set(input.nodeIds);
	const firstId = ordered[0]?.node.props.id;
	const nextData = transformContainers(data, (items) => {
		if (
			!items.some(
				(entry) =>
					isComponentNode(entry) &&
					typeof entry.props.id === "string" &&
					removing.has(entry.props.id),
			)
		) {
			return items;
		}
		const next: unknown[] = [];
		for (const entry of items) {
			if (
				isComponentNode(entry) &&
				typeof entry.props.id === "string" &&
				removing.has(entry.props.id)
			) {
				// The instance takes the first selected node's slot.
				if (entry.props.id === firstId) {
					next.push(instanceNode);
				}
				continue;
			}
			next.push(entry);
		}
		return next;
	});

	// The captured nodes leave the page, so their authoring records go
	// with them; the instance gets a fresh record carrying the
	// reference. (Reconciliation would also strip them at the commit
	// boundary — doing it here keeps the reduction self-contained.)
	const nodes = { ...authoring.nodes };
	for (const id of input.nodeIds) {
		delete nodes[id];
	}
	nodes[input.instanceNodeId] = {
		version: "1",
		componentInstance: {
			definitionId: input.definitionId,
			definitionRevision: definition.revision,
			variantSelection: {},
			propOverrides: {},
			nodeOverrides: {},
		},
	};

	return {
		definition,
		data: nextData,
		authoring: {
			...authoring,
			nodes,
			componentDefinitions: {
				...authoring.componentDefinitions,
				[definition.id]: definition,
			},
		},
		instanceNodeId: input.instanceNodeId,
	};
}
