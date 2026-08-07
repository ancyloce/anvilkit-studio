/**
 * @file Capture-a-component-from-a-selection, on the canonical
 * carriers (PLAN-0026 §3.1; the `p3-001` port that `p3-009`'s gate
 * requires before `editor/components/create.ts` can be deleted).
 *
 * This is the carrier-model successor to the sidecar's
 * `buildCreateComponentPlan`. The **algorithm** is unchanged — DD-0019
 * §14.3's rules (one scope, expressible parent order, serializable
 * props, preserved slot boundaries, no cycles, multiple roots wrapped
 * in an editor-owned `ComponentFrame`) are ported verbatim, because
 * they are statements about the document tree and the tree did not
 * change. What changed is every place the old code reached for
 * `AuthoringStateV1`:
 *
 * | Sidecar read | Carrier read |
 * | --- | --- |
 * | `authoring.nodes[id].locked` | the `editorAnnotations` root prop (`p3-006`) |
 * | `authoring.nodes[id].componentInstance` | the declared instance prop |
 * | `authoring.componentDefinitions` | the `componentLibrary` root prop (`p3-001`) |
 *
 * **One deletion that became structural.** The sidecar had to
 * explicitly `delete authoring.nodes[id]` for every captured node, or
 * the records of nodes that had left the page would linger until
 * reconciliation swept them. On the carrier model a node's editor
 * state lives in its own props, so removing the node from `content`
 * removes its carriers with it, atomically and by construction. That
 * whole class of orphan is not handled better here — it is
 * unrepresentable.
 *
 * Freeze D-7 is preserved: no id is generated and no clock is read.
 * The caller supplies `definitionId`, `instanceNodeId` and
 * `timestamp`.
 */

import type {
	ComponentDefinition,
	EditorAnnotations,
	EditorError,
	JsonValue,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { readDocument } from "../document-model/index.js";
import { writeComponentInstanceProp } from "../document-model/materialize.js";
import { makeEditorError } from "../editor/diagnostics.js";
import {
	indexNodeLocations,
	isComponentNode,
	type PuckTreeNode,
	transformContainers,
} from "../editor/tree/nodes.js";
import { withComponentLibrary } from "./update-component-library.js";

/**
 * The editor-owned wrapper type used when a multi-node selection has
 * no single root (§14.3). It is a *definition-internal* node type; it
 * never needs a host component registration because it only ever
 * appears inside `ComponentDefinition.root`.
 *
 * Value-identical to the sidecar's constant on purpose: documents
 * written before this port contain definitions rooted at this exact
 * type string, and they must keep materializing.
 */
export const COMPONENT_FRAME_TYPE = "ComponentFrame";

/** Inputs for {@link createComponentFromSelectionInData}. */
export interface CreateComponentInput {
	readonly data: Data;
	readonly config: Config;
	readonly nodeIds: readonly string[];
	readonly name: string;
	/** Caller-generated (`crypto.randomUUID()`), never derived here. */
	readonly definitionId: string;
	readonly instanceNodeId: string;
	/** ISO timestamp; never read from a clock here (freeze D-7). */
	readonly timestamp: string;
}

/** Outcome of the pure reduction, matching the P3 helper convention. */
export interface CreateComponentResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
	/** The definition that was captured; absent unless `updated`. */
	readonly definition?: ComponentDefinition;
}

const NO_ERRORS: readonly EditorError[] = Object.freeze([]);

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
 * Validate a create-from-selection request against the live document
 * (§14.3). Returns every problem found; an empty array means the
 * request is safe to build.
 *
 * Reads carriers through {@link readDocument} rather than re-parsing,
 * so the rules are judged against exactly the document the inspector
 * and the compiler see.
 */
export function validateCreateComponentSelection(
	data: Data,
	config: Config,
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

	const model = readDocument(data, config);

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
	// creation removes them from the page. `p3-006` moved the flag off
	// the sidecar onto the `editorAnnotations` root prop; this is the
	// same rule reading the carrier the LayersPanel now writes.
	const annotations: EditorAnnotations = model.annotations;
	const locked = nodeIds.filter((id) => annotations[id]?.locked === true);
	if (locked.length > 0) {
		errors.push(
			makeEditorError(
				"EDITOR_NODE_LOCKED",
				"create-component would move locked nodes",
				{ nodeIds: locked },
			),
		);
	}

	// Serializable props (§14.3): the definition is persisted in a
	// declared root prop, so anything non-JSON would be silently lost
	// on save — the same hazard as the sidecar had, for the same
	// reason, since both are serialized with the document.
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
	// unrepresentable. Detected against the existing graph — now the
	// declared instance prop and the `componentLibrary` root prop
	// rather than two sidecar maps.
	const definitions = model.componentLibrary?.definitions ?? {};
	const cycles = nodeIds.filter((id) => {
		const instance = model.nodes.get(id)?.componentInstance;
		return (
			instance !== undefined && definitions[instance.definitionId] === undefined
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

	const count = Object.keys(definitions).length + 1;
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

/** Strip a subtree to the JSON-safe shape the definition persists. */
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
 * node, and write both into ONE `Data`.
 *
 * The selection is replaced **in place** — the instance lands at the
 * position of the first selected node, preserving the expressible
 * parent order §14.3 requires. Multiple roots are wrapped in a
 * {@link COMPONENT_FRAME_TYPE} definition node.
 *
 * "One `Data`" is not an optimization: the definition lands on
 * `root.props.componentLibrary` and the instance lands in `content`,
 * and a document that has one without the other is a dangling
 * reference. Emitting both in a single value is what lets the caller
 * commit them in a single `setData`, hence a single undo.
 */
export function createComponentFromSelectionInData(
	input: CreateComponentInput,
): CreateComponentResult {
	const errors = validateCreateComponentSelection(
		input.data,
		input.config,
		input.nodeIds,
	);
	if (errors.length > 0) {
		return { data: input.data, status: "rejected", errors };
	}

	const locations = indexNodeLocations(input.data);
	const selected = input.nodeIds
		.map((id) => locations.get(id))
		.filter((location) => location !== undefined);
	if (selected.length !== input.nodeIds.length || selected.length === 0) {
		// Unreachable after validation; kept so the builder stays total.
		return { data: input.data, status: "noop", errors: NO_ERRORS };
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

	const definition: ComponentDefinition = {
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

	// The instance carrier rides on the node's own props — the whole
	// point of the port. `writeComponentInstanceProp` emits the
	// canonical key and drops the legacy one.
	const instanceNode: PuckTreeNode = {
		type: ordered[0]?.node.type ?? COMPONENT_FRAME_TYPE,
		props: writeComponentInstanceProp(
			{ id: input.instanceNodeId },
			{
				definitionId: input.definitionId,
				definitionRevision: definition.revision,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: {},
			},
		) as PuckTreeNode["props"],
	};

	const removing = new Set(input.nodeIds);
	const firstId = ordered[0]?.node.props.id;
	const withInstance = transformContainers(input.data, (items) => {
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

	const model = readDocument(input.data, input.config);
	const nextData = withComponentLibrary(withInstance, {
		definitions: {
			...(model.componentLibrary?.definitions ?? {}),
			[definition.id]: definition,
		},
	});

	return { data: nextData, status: "updated", errors: NO_ERRORS, definition };
}

/** Dependencies of {@link commitCreateComponent}. */
export interface CreateComponentCommitDeps {
	readonly getPuckApi: () => PuckApi;
}

/** Caller-supplied identity for one capture (freeze D-7). */
export type CreateComponentRequest = Omit<
	CreateComponentInput,
	"data" | "config"
>;

/** Outcome of a commit attempt. */
export interface CreateComponentCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
	/** The captured definition; absent unless `committed`. */
	readonly definition?: ComponentDefinition;
	/** The new instance node id; absent unless `committed`. */
	readonly instanceNodeId?: string;
}

/**
 * Capture a component from the current selection through ONE
 * history-recording functional-updater `setData` dispatch, so the
 * whole creation — definition written to `componentLibrary`, selected
 * nodes replaced by one instance node — is exactly one undo step
 * (freeze D-3; CFX-C06).
 *
 * The re-derivation in the updater is not decorative: it is the
 * concurrency model. If a collab peer lands an edit between reading
 * `current` and the reducer running, the capture re-runs against the
 * document that actually arrived — and re-validates, so a selection
 * that stopped being capturable in the interval yields the input
 * document rather than a corrupted one.
 */
export function commitCreateComponent(
	deps: CreateComponentCommitDeps,
	request: CreateComponentRequest,
): CreateComponentCommitResult {
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const config = api.config as Config;
	const result = createComponentFromSelectionInData({
		...request,
		data: current,
		config,
	});
	if (result.status !== "updated") {
		return {
			status: result.status === "noop" ? "noop" : "rejected",
			errors: result.errors,
		};
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) =>
			previous === current
				? result.data
				: createComponentFromSelectionInData({ ...request, data: previous, config })
						.data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return {
		status: "committed",
		errors: NO_ERRORS,
		...(result.definition !== undefined
			? { definition: result.definition }
			: {}),
		instanceNodeId: request.instanceNodeId,
	};
}
