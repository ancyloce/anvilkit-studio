/**
 * @file `materializeInstance` — resolve a component instance into a
 * concrete subtree (PLAN-0020 CORE-P2-005; ED-COMP-005; DD-0019
 * §14.2, §24.4).
 *
 * §24.4 precedence, applied in exactly this order:
 *
 *   definition base → variant patch → exposed properties
 *     → instance node overrides → nested materialization
 *
 * Two invariants this file exists to protect:
 *
 * - **Runtime ids are never persisted.** Materialization stamps
 *   `${instanceNodeId}::${definitionNodeId}` onto the produced nodes
 *   so preview, hit-testing, and export all address the same nodes;
 *   those ids exist only in the materialized output and never enter
 *   `AuthoringStateV1` or `PuckData` (§14.2).
 * - **Cycles and depth are rejected before commit**, with the full
 *   path (`Card → Badge → Card`) so the diagnostic names the loop
 *   rather than just reporting that one exists.
 *
 * Deviation from the §24.4 pseudocode, noted deliberately: the DD
 * sketch `throw`s. This returns a typed result instead, matching
 * `resolveToken` (§24.5) and the rest of the engine — pure, total,
 * and safe on hostile documents. Callers map the failure statuses to
 * `EDITOR_COMPONENT_CYCLE` / `EDITOR_DEFINITION_UNAVAILABLE`.
 */

import type {
	ComponentDefinitionId,
	ComponentDefinitionV1,
	ComponentInstanceState,
	ComponentPropDefinition,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";

/**
 * The prop key that marks a node inside a definition root as a
 * **nested component instance**.
 *
 * `ComponentInstanceState` is stored per page node in
 * `AuthoringStateV1.nodes[id].componentInstance`, which has no
 * equivalent inside a definition's `root` — yet §14.3 requires cycle
 * detection and §24.4 caps nesting depth at 10, both of which
 * presuppose that definitions can contain instances. This reserved,
 * JSON-safe prop is that encoding. It lives inside
 * `SerializablePuckNode.props` (already `Record<string, JsonValue>`),
 * so it needs no contract change and round-trips through the sidecar
 * untouched.
 */
export const COMPONENT_INSTANCE_PROP = "__anvilkitInstance";

/** The outcome of materializing one instance. */
export type MaterializeResult =
	| {
			readonly status: "materialized";
			readonly node: SerializablePuckNode;
			/**
			 * Runtime node id → the authoring families the instance
			 * overrides carry for it. Feeds the style resolver; never
			 * persisted.
			 */
			readonly authoring: Readonly<
				Record<string, Omit<NodeOverridePatch, "props">>
			>;
	  }
	| {
			/** Full path, loop-closing definition included. */
			readonly status: "cycle";
			readonly path: readonly ComponentDefinitionId[];
	  }
	| {
			readonly status: "depth-exceeded";
			readonly path: readonly ComponentDefinitionId[];
	  }
	| {
			readonly status: "missing-definition";
			readonly definitionId: ComponentDefinitionId;
	  };

/** The runtime id for a definition node under an instance (§14.2). */
export function runtimeNodeId(
	instanceNodeId: string,
	definitionNodeId: string,
): string {
	return `${instanceNodeId}::${definitionNodeId}`;
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

function definitionNodeIdOf(node: SerializablePuckNode): string | undefined {
	const id = node.props.id;
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** The nested-instance state a definition node carries, if any. */
function nestedInstanceOf(
	node: SerializablePuckNode,
): ComponentInstanceState | undefined {
	const raw = node.props[COMPONENT_INSTANCE_PROP];
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return undefined;
	}
	const candidate = raw as { definitionId?: unknown };
	return typeof candidate.definitionId === "string"
		? (raw as unknown as ComponentInstanceState)
		: undefined;
}

/** Map a node tree, visiting slot-prop children. */
function mapTree(
	node: SerializablePuckNode,
	visit: (node: SerializablePuckNode) => SerializablePuckNode,
): SerializablePuckNode {
	const visited = visit(node);
	const props: Record<string, JsonValue> = { ...visited.props };
	let changed = false;
	for (const [key, value] of Object.entries(visited.props)) {
		if (Array.isArray(value) && value.some(isNode)) {
			props[key] = value.map((entry) =>
				isNode(entry)
					? (mapTree(entry, visit) as unknown as JsonValue)
					: (entry as JsonValue),
			);
			changed = true;
		}
	}
	return changed ? { type: visited.type, props } : visited;
}

/** Write `value` at a structural property path (exposed props). */
function setAtPath(
	props: Readonly<Record<string, JsonValue>>,
	path: readonly (string | number)[],
	value: JsonValue,
): Record<string, JsonValue> {
	if (path.length === 0) {
		return { ...props };
	}
	const [head, ...rest] = path;
	const key = String(head);
	const next: Record<string, JsonValue> = { ...props };
	if (rest.length === 0) {
		next[key] = value;
		return next;
	}
	const current = next[key];
	next[key] =
		typeof current === "object" && current !== null && !Array.isArray(current)
			? (setAtPath(
					current as Record<string, JsonValue>,
					rest,
					value,
				) as unknown as JsonValue)
			: (setAtPath({}, rest, value) as unknown as JsonValue);
	return next;
}

/**
 * Apply per-definition-node **prop** patches into the tree in place.
 *
 * Prop patches must land in the tree at their own precedence step,
 * not be deferred to the final pass: deferring the variant patch
 * alongside the instance node overrides would let it overwrite
 * exposed properties, inverting the §24.4 order.
 */
function applyPropsByNodeId(
	root: SerializablePuckNode,
	byNodeId: ReadonlyMap<string, Readonly<Record<string, JsonValue>>>,
): SerializablePuckNode {
	if (byNodeId.size === 0) {
		return root;
	}
	return mapTree(root, (node) => {
		const definitionNodeId = definitionNodeIdOf(node);
		const patch =
			definitionNodeId === undefined
				? undefined
				: byNodeId.get(definitionNodeId);
		return patch === undefined
			? node
			: { type: node.type, props: { ...node.props, ...patch } };
	});
}

/**
 * Step 1 — select the variant. The variant whose axis selection
 * matches the instance's is applied; matching is exact over every
 * declared axis, so an instance with an incomplete selection matches
 * nothing and simply renders the definition base.
 */
function selectVariant(
	definition: ComponentDefinitionV1,
	selection: Readonly<Record<string, string>>,
): Readonly<Record<string, NodeOverridePatch>> {
	const axes = definition.variantAxes;
	if (axes.length === 0) {
		return {};
	}
	const match = definition.variants.find((variant) =>
		axes.every((axis) => variant.selection[axis.id] === selection[axis.id]),
	);
	return match?.patch ?? {};
}

/** Step 2 — exposed properties, written at their `sourcePath`. */
function applyExposedProps(
	root: SerializablePuckNode,
	exposed: readonly ComponentPropDefinition[],
	overrides: Readonly<Record<string, JsonValue>>,
): SerializablePuckNode {
	let next = root;
	for (const definitionProp of exposed) {
		const value = Object.hasOwn(overrides, definitionProp.id)
			? overrides[definitionProp.id]
			: definitionProp.defaultValue;
		if (value === undefined) {
			continue;
		}
		next = {
			type: next.type,
			props: setAtPath(next.props, definitionProp.sourcePath, value),
		};
	}
	return next;
}

/**
 * Materialize one instance (DD-0019 §24.4, verbatim order).
 *
 * @param instanceNodeId the page node carrying the instance — the
 *   left half of every runtime id it produces
 * @param stack definition ids already being materialized, innermost
 *   last; the caller leaves this empty
 */
export function materializeInstance(
	instanceNodeId: string,
	instance: ComponentInstanceState,
	definitions: Readonly<Record<string, ComponentDefinitionV1>>,
	stack: readonly ComponentDefinitionId[] = [],
): MaterializeResult {
	if (stack.includes(instance.definitionId)) {
		// Report the loop-closing hop too, so the path reads
		// `Card → Badge → Card` rather than `Card → Badge`.
		return { status: "cycle", path: [...stack, instance.definitionId] };
	}
	if (stack.length >= EDITOR_COUNT_LIMITS.componentNestingDepth) {
		return {
			status: "depth-exceeded",
			path: [...stack, instance.definitionId],
		};
	}
	const definition = definitions[instance.definitionId];
	if (definition === undefined) {
		return {
			status: "missing-definition",
			definitionId: instance.definitionId,
		};
	}

	// §24.4 order. Prop patches land in the tree at their own step;
	// only the authoring families are deferred to the final pass,
	// because they key off runtime ids that do not exist until then.
	const variantPatch = selectVariant(definition, instance.variantSelection);
	const variantProps = new Map<string, Readonly<Record<string, JsonValue>>>();
	for (const [definitionNodeId, patch] of Object.entries(variantPatch)) {
		if (patch.props !== undefined) {
			variantProps.set(definitionNodeId, patch.props);
		}
	}

	// 1 — variant patch over the definition base.
	let tree = applyPropsByNodeId(definition.root, variantProps);
	// 2 — exposed properties over the variant.
	tree = applyExposedProps(
		tree,
		definition.exposedProps,
		instance.propOverrides,
	);
	// 3 — instance node overrides (highest precedence) are applied in
	// the same pass that stamps runtime ids, together with the
	// authoring families from both layers.
	const patches = new Map<string, NodeOverridePatch[]>();
	for (const [definitionNodeId, patch] of Object.entries(variantPatch)) {
		patches.set(definitionNodeId, [{ ...patch, props: undefined }]);
	}
	for (const [definitionNodeId, patch] of Object.entries(
		instance.nodeOverrides,
	)) {
		patches.set(definitionNodeId, [
			...(patches.get(definitionNodeId) ?? []),
			patch,
		]);
	}

	const authoring: Record<string, Omit<NodeOverridePatch, "props">> = {};
	let failure: MaterializeResult | null = null;

	const materialized = mapTree(tree, (node) => {
		const definitionNodeId = definitionNodeIdOf(node);
		let props: Record<string, JsonValue> = { ...node.props };

		if (definitionNodeId !== undefined) {
			const runtimeId = runtimeNodeId(instanceNodeId, definitionNodeId);
			const applicable = patches.get(definitionNodeId) ?? [];
			for (const patch of applicable) {
				if (patch.props !== undefined) {
					props = { ...props, ...patch.props };
				}
				const families: Omit<NodeOverridePatch, "props"> = {
					...(authoring[runtimeId] ?? {}),
					...(patch.layout !== undefined ? { layout: patch.layout } : {}),
					...(patch.style !== undefined ? { style: patch.style } : {}),
					...(patch.typography !== undefined
						? { typography: patch.typography }
						: {}),
					...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
				};
				if (Object.keys(families).length > 0) {
					authoring[runtimeId] = families;
				}
			}
			// Runtime id: output-only, never written back to the document.
			props.id = runtimeId;
		}

		// Step 4 — nested materialization, depth-first.
		const nested = nestedInstanceOf(node);
		if (nested !== undefined && failure === null) {
			const inner = materializeInstance(
				definitionNodeId === undefined
					? instanceNodeId
					: runtimeNodeId(instanceNodeId, definitionNodeId),
				nested,
				definitions,
				[...stack, instance.definitionId],
			);
			if (inner.status !== "materialized") {
				failure = inner;
				return node;
			}
			for (const [id, families] of Object.entries(inner.authoring)) {
				authoring[id] = families;
			}
			return inner.node;
		}

		return { type: node.type, props };
	});

	if (failure !== null) {
		return failure;
	}
	return { status: "materialized", node: materialized, authoring };
}

/**
 * Human-readable cycle path, using definition **names** where known
 * (`Card → Badge → Card`) so the diagnostic reads the way §24.4
 * describes it.
 */
export function formatComponentPath(
	path: readonly ComponentDefinitionId[],
	definitions: Readonly<Record<string, ComponentDefinitionV1>>,
): string {
	return path.map((id) => definitions[id]?.name ?? id).join(" → ");
}
