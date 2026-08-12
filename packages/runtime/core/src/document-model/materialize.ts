/**
 * @file Component materialization — the resolved instance tree.
 *
 * **Moved here from `editor/components/materialize.ts` by `p2-004`.**
 * The algorithm was already carrier-agnostic — it takes a
 * `ComponentInstanceState` and a plain `definitions` record and never
 * touched `AuthoringStateV1` — but it lived in a directory PLAN-0026
 * §3.1 deletes wholesale at `p3-009`. `p2-004` must *retain* the
 * algorithm (reuse the algorithm, never the old data source), so it
 * moves to a home that survives. `editor/components/materialize.ts` is
 * now a re-export shim for its remaining sidecar-era callers and dies
 * with them.
 *
 * Behaviour is unchanged, deliberately and to the letter: this is a
 * relocation, not a rewrite. The shipped implementation encodes edge
 * cases the spec does not, which is exactly why it is not re-derived.
 */

import type {
	ComponentDefinition,
	ComponentDefinitionId,
	ComponentInstanceState,
	ComponentPropDefinition,
	ComponentVariant,
	EditorError,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { makeEditorError } from "../editor/diagnostics.js";

/**
 * The prop key that marks a node inside a definition root as a
 * **nested component instance**.
 *
 * A component instance has no equivalent inside a definition's `root`
 * — yet §14.3 requires cycle detection and §24.4 caps nesting depth at
 * 10, both of which presuppose that definitions can contain instances.
 * This reserved, JSON-safe prop is that encoding. It lives inside
 * `SerializablePuckNode.props` (already `Record<string, JsonValue>`),
 * so it needs no contract change.
 *
 * **One spelling.** `p3-003` renamed the write side from the legacy
 * `__anvilkitInstance`; `p7-002` renamed it in the store and closed the
 * dual read that bridged the two. There is no fallback key left to
 * read, and re-introducing one would be re-opening a window that a
 * one-way data migration has already closed.
 */
export const CANONICAL_COMPONENT_INSTANCE_PROP = "anvilComponentInstance";

/**
 * Write the instance link.
 *
 * `p3-003` executed PLAN-0026 §2's last document-visible rename; since
 * `p7-002` migrated the store there is a single spelling on both the
 * read and the write side.
 */
export function writeComponentInstanceProp(
	props: Readonly<Record<string, unknown>>,
	instance: unknown,
): Record<string, unknown> {
	return { ...props, [CANONICAL_COMPONENT_INSTANCE_PROP]: instance };
}

/** Read the instance-link prop. */
export function readComponentInstanceProp(
	props: Readonly<Record<string, unknown>>,
): unknown {
	return props[CANONICAL_COMPONENT_INSTANCE_PROP];
}

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
	const raw = readComponentInstanceProp(node.props);
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
	definition: ComponentDefinition,
	selection: Readonly<Record<string, string>>,
): Readonly<Record<string, NodeOverridePatch>> {
	// One matcher, shared with the variant-model validator, so
	// "which variant is active" cannot mean two different things.
	return matchVariant(definition, selection)?.patch ?? {};
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
	definitions: Readonly<Record<string, ComponentDefinition>>,
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
	definitions: Readonly<Record<string, ComponentDefinition>>,
): string {
	return path.map((id) => definitions[id]?.name ?? id).join(" → ");
}

/**
 * The variant whose axis selection matches exactly (ED-VARIANT-001).
 *
 * Moved here from `editor/components/variants.ts` by `p2-004`: it is
 * carrier-agnostic (it reads a `ComponentDefinition` and a selection,
 * never the sidecar) and `materializeInstance` cannot resolve without
 * it, so it must not live in a module `p3-009` deletes. `variants.ts`
 * re-exports it, so "which variant is active" still has exactly one
 * definition.
 */
export function matchVariant(
	definition: ComponentDefinition,
	selection: Readonly<Record<string, string>>,
): ComponentVariant | undefined {
	if (definition.variantAxes.length === 0) {
		return undefined;
	}
	return definition.variants.find((variant) =>
		definition.variantAxes.every(
			(axis) => variant.selection[axis.id] === selection[axis.id],
		),
	);
}

/**
 * Every node id declared inside a definition's root subtree.
 *
 * Moved here from `editor/components/instances.ts` by `p2-004` for the
 * same reason as {@link matchVariant}: carrier-agnostic, and the
 * orphan-override projection depends on it.
 */
export function collectDefinitionNodeIds(
	definition: ComponentDefinition,
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

/* -------------------------------------------------------------------------
 * Variant model algebra — moved here from `editor/components/variants.ts`
 * by `p3-002`, for the same reason `matchVariant` moved in `p2-004`: these
 * are pure functions of a `ComponentDefinition` (they never touched the
 * sidecar), and `p3-009` deletes the directory they lived in. `variants.ts`
 * now re-exports them and is a pure shim.
 * ---------------------------------------------------------------------- */

/** A stable key for one axis selection, independent of key order. */
export function variantCombinationKey(
	selection: Readonly<Record<string, string>>,
): string {
	return Object.keys(selection)
		.sort()
		.map((axisId) => `${axisId}=${selection[axisId]}`)
		.join("&");
}

/** How many combinations the declared axes can express. */
export function variantCombinationCount(axes: readonly VariantAxis[]): number {
	return axes.reduce((total, axis) => total * axis.options.length, 1);
}

/**
 * Validate a component's variant model. Returns every violation; an
 * empty array means the model is unambiguous and within caps.
 */
export function validateVariantModel(
	definition: ComponentDefinition,
): readonly EditorError[] {
	const errors: EditorError[] = [];
	const definitionId = definition.id;

	if (
		definition.variantAxes.length > EDITOR_COUNT_LIMITS.variantAxesPerComponent
	) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`components allow at most ${EDITOR_COUNT_LIMITS.variantAxesPerComponent} variant axes`,
				{
					details: {
						limitKey: "variantAxesPerComponent",
						limit: EDITOR_COUNT_LIMITS.variantAxesPerComponent,
						actual: definition.variantAxes.length,
						definitionId,
					},
				},
			),
		);
	}
	if (definition.variants.length > EDITOR_COUNT_LIMITS.variantsPerComponent) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`components allow at most ${EDITOR_COUNT_LIMITS.variantsPerComponent} variants`,
				{
					details: {
						limitKey: "variantsPerComponent",
						limit: EDITOR_COUNT_LIMITS.variantsPerComponent,
						actual: definition.variants.length,
						definitionId,
					},
				},
			),
		);
	}

	// Axis identity.
	const axisIds = new Set<string>();
	const optionsByAxis = new Map<string, Set<string>>();
	for (const axis of definition.variantAxes) {
		if (axisIds.has(axis.id)) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`duplicate variant axis id "${axis.id}"`,
					{
						details: {
							kind: "variantAxis",
							definitionId,
							axisId: axis.id,
							reason: "duplicate-id",
						},
					},
				),
			);
		}
		axisIds.add(axis.id);

		const optionIds = new Set<string>();
		for (const option of axis.options) {
			if (optionIds.has(option.id)) {
				errors.push(
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						`duplicate option id "${option.id}" on axis "${axis.id}"`,
						{
							details: {
								kind: "variantAxisOption",
								definitionId,
								axisId: axis.id,
								optionId: option.id,
								reason: "duplicate-id",
							},
						},
					),
				);
			}
			optionIds.add(option.id);
		}
		optionsByAxis.set(axis.id, optionIds);
	}

	// Variant identity and selection completeness.
	const variantIds = new Set<string>();
	const combinations = new Map<string, string>();
	for (const variant of definition.variants) {
		if (variantIds.has(variant.id)) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`duplicate variant id "${variant.id}"`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							reason: "duplicate-id",
						},
					},
				),
			);
		}
		variantIds.add(variant.id);

		for (const [axisId, optionId] of Object.entries(variant.selection)) {
			const options = optionsByAxis.get(axisId);
			if (options === undefined) {
				errors.push(
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`variant "${variant.id}" selects unknown axis "${axisId}"`,
						{
							details: {
								kind: "variantAxis",
								definitionId,
								variantId: variant.id,
								axisId,
							},
						},
					),
				);
				continue;
			}
			if (!options.has(optionId)) {
				errors.push(
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`variant "${variant.id}" selects unknown option "${optionId}" on axis "${axisId}"`,
						{
							details: {
								kind: "variantAxisOption",
								definitionId,
								variantId: variant.id,
								axisId,
								optionId,
							},
						},
					),
				);
			}
		}

		const missing = definition.variantAxes
			.map((axis) => axis.id)
			.filter((axisId) => variant.selection[axisId] === undefined);
		if (missing.length > 0) {
			errors.push(
				makeEditorError(
					"EDITOR_CAPABILITY_UNSUPPORTED",
					`variant "${variant.id}" must select every axis; missing ${missing.join(", ")}`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							reason: "incomplete-selection",
							missingAxisIds: missing,
						},
					},
				),
			);
			continue;
		}

		const key = variantCombinationKey(variant.selection);
		const existing = combinations.get(key);
		if (existing !== undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`variants "${existing}" and "${variant.id}" declare the same combination`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							conflictsWith: existing,
							reason: "duplicate-combination",
						},
					},
				),
			);
			continue;
		}
		combinations.set(key, variant.id);
	}

	return errors;
}
