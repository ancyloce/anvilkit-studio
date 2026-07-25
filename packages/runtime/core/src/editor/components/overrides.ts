/**
 * @file Override reset granularity (PLAN-0020 CORE-P2-008;
 * ED-COMP-008; DD-0019 §14.6; freeze §3.3–§3.5, §6).
 *
 * Three operations, deliberately distinct:
 *
 * - **reset-one** removes a single addressed override at one layer;
 *   an address that matches nothing is a **noop, not an error**
 *   (freeze §8) — resetting an already-default property is a
 *   perfectly reasonable thing for a user to click.
 * - **reset-all** removes every override on an instance across all
 *   layers — both exposed-property and node overrides — returning it
 *   to definition-plus-variant resolution.
 * - **promote** writes the override's value into the definition
 *   default, bumps the definition revision so propagation is
 *   observable, and drops the now-redundant instance override **in
 *   the same reduction**, so the resolved appearance never flickers
 *   through an intermediate state.
 *
 * Per freeze §6 the reducer is **scope-independent**: main-component
 * mode is transient UI state that never reaches `AuthoringStateV1`,
 * so promote validates structurally here and the UI owns routing it
 * through the isolated scope.
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	ComponentOverrideTarget,
	JsonValue,
	NodeOverridePatch,
	PropertyPath,
	ResponsiveLayerRef,
	ResponsiveValue,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { withRecord } from "../node-records.js";

/** The families of a `NodeOverridePatch` that are responsive. */
const RESPONSIVE_FAMILIES = new Set([
	"layout",
	"style",
	"typography",
	"hidden",
]);

/**
 * Split an override address into the patch member it targets and the
 * path within it.
 *
 * `ComponentOverrideTarget.propertyPath` is documented as rooted at
 * the definition node's `props`. A path whose first segment names a
 * responsive family is instead read as addressing that family at
 * `layer` — the two readings cannot collide, because a Puck prop
 * named `layout`/`style`/`typography`/`hidden` would be shadowed by
 * the authoring family of the same name anyway.
 */
function addressOf(path: PropertyPath): {
	readonly member: "props" | "layout" | "style" | "typography" | "hidden";
	readonly rest: PropertyPath;
} {
	const head = path[0];
	if (typeof head === "string" && RESPONSIVE_FAMILIES.has(head)) {
		return {
			member: head as "layout" | "style" | "typography" | "hidden",
			rest: path.slice(1),
		};
	}
	return { member: "props", rest: path };
}

/** Remove a value at `path`; returns `undefined` when emptied out. */
function deleteAtPath(value: unknown, path: PropertyPath): unknown | undefined {
	if (path.length === 0 || typeof value !== "object" || value === null) {
		return undefined;
	}
	const [head, ...rest] = path;
	const key = String(head);
	const source = value as Record<string, unknown>;
	if (!Object.hasOwn(source, key)) {
		return value;
	}
	const next: Record<string, unknown> = { ...source };
	if (rest.length === 0) {
		delete next[key];
	} else {
		const child = deleteAtPath(next[key], rest);
		if (child === undefined) {
			delete next[key];
		} else {
			next[key] = child;
		}
	}
	return Object.keys(next).length === 0 ? undefined : next;
}

/** Read a value at `path`, or `undefined`. */
function readAtPath(value: unknown, path: PropertyPath): unknown {
	let cursor: unknown = value;
	for (const segment of path) {
		if (typeof cursor !== "object" || cursor === null) {
			return undefined;
		}
		cursor = (cursor as Record<string, unknown>)[String(segment)];
	}
	return cursor;
}

function withoutFamilyLayer<T>(
	family: ResponsiveValue<T> | undefined,
	layer: ResponsiveLayerRef,
	rest: PropertyPath,
): ResponsiveValue<T> | undefined {
	if (family === undefined) {
		return undefined;
	}
	const current = layer === "base" ? family.base : family.overrides?.[layer];
	if (current === undefined || current === null) {
		return family;
	}
	const nextEntry =
		rest.length === 0
			? undefined
			: (deleteAtPath(current, rest) as T | undefined);
	const next: ResponsiveValue<T> = { ...family };
	if (layer === "base") {
		if (nextEntry === undefined) {
			delete (next as { base?: T }).base;
		} else {
			(next as { base?: T }).base = nextEntry;
		}
	} else {
		const overrides = { ...(family.overrides ?? {}) };
		if (nextEntry === undefined) {
			delete overrides[layer];
		} else {
			overrides[layer] = nextEntry;
		}
		if (Object.keys(overrides).length === 0) {
			delete (next as { overrides?: unknown }).overrides;
		} else {
			(next as { overrides?: Record<string, T | null> }).overrides = overrides;
		}
	}
	return next.base === undefined && next.overrides === undefined
		? undefined
		: next;
}

/** Drop empty members so an emptied patch disappears entirely. */
function compactPatch(patch: NodeOverridePatch): NodeOverridePatch | undefined {
	const entries = Object.entries(patch).filter(
		([, value]) => value !== undefined,
	);
	return entries.length === 0
		? undefined
		: (Object.fromEntries(entries) as NodeOverridePatch);
}

/**
 * Remove one addressed override at one layer (freeze §3.3).
 * Returns the input state unchanged when nothing matched — a noop,
 * not an error.
 */
export function resetComponentOverride(
	state: AuthoringStateV1,
	instanceNodeId: string,
	target: ComponentOverrideTarget,
	layer: ResponsiveLayerRef,
): AuthoringStateV1 {
	const record = state.nodes[instanceNodeId];
	const instance = record?.componentInstance;
	if (record === undefined || instance === undefined) {
		return state;
	}
	const patch = instance.nodeOverrides[target.definitionNodeId];
	if (patch === undefined) {
		return state;
	}

	const { member, rest } = addressOf(target.propertyPath);
	let nextPatch: NodeOverridePatch | undefined;
	if (member === "props") {
		const nextProps = deleteAtPath(patch.props, rest) as
			| Readonly<Record<string, JsonValue>>
			| undefined;
		if (nextProps === patch.props) {
			return state;
		}
		nextPatch = compactPatch({ ...patch, props: nextProps });
	} else {
		const family = patch[member] as ResponsiveValue<unknown> | undefined;
		const nextFamily = withoutFamilyLayer(family, layer, rest);
		if (nextFamily === family) {
			return state;
		}
		nextPatch = compactPatch({
			...patch,
			[member]: nextFamily,
		} as NodeOverridePatch);
	}

	const nodeOverrides = { ...instance.nodeOverrides };
	if (nextPatch === undefined) {
		delete nodeOverrides[target.definitionNodeId];
	} else {
		nodeOverrides[target.definitionNodeId] = nextPatch;
	}
	return withRecord(state, instanceNodeId, {
		...record,
		componentInstance: { ...instance, nodeOverrides },
	});
}

/**
 * Remove every override on each listed instance, across all layers
 * (freeze §3.4). Multi-instance is one intent.
 */
export function resetAllComponentOverrides(
	state: AuthoringStateV1,
	instanceNodeIds: readonly string[],
): AuthoringStateV1 {
	let next = state;
	for (const instanceNodeId of instanceNodeIds) {
		const record = next.nodes[instanceNodeId];
		const instance = record?.componentInstance;
		if (record === undefined || instance === undefined) {
			continue;
		}
		if (
			Object.keys(instance.propOverrides).length === 0 &&
			Object.keys(instance.nodeOverrides).length === 0
		) {
			continue;
		}
		next = withRecord(next, instanceNodeId, {
			...record,
			componentInstance: {
				...instance,
				propOverrides: {},
				nodeOverrides: {},
			},
		});
	}
	return next;
}

/** Write a value at a path inside a definition node's props. */
function writeDefinitionProp(
	definition: ComponentDefinitionV1,
	definitionNodeId: string,
	path: PropertyPath,
	value: JsonValue,
): ComponentDefinitionV1 | undefined {
	let found = false;
	const walk = (node: SerializablePuckNode): SerializablePuckNode => {
		const props: Record<string, JsonValue> = { ...node.props };
		if (node.props.id === definitionNodeId) {
			found = true;
			const [head, ...rest] = path;
			const key = String(head);
			props[key] =
				rest.length === 0
					? value
					: (setDeep(props[key], rest, value) as JsonValue);
		}
		for (const [key, entry] of Object.entries(node.props)) {
			if (Array.isArray(entry)) {
				props[key] = entry.map((child) =>
					typeof child === "object" &&
					child !== null &&
					!Array.isArray(child) &&
					typeof (child as { type?: unknown }).type === "string"
						? (walk(child as unknown as SerializablePuckNode) as never)
						: (child as JsonValue),
				);
			}
		}
		return { type: node.type, props };
	};
	const root = walk(definition.root);
	return found ? { ...definition, root } : undefined;
}

function setDeep(
	current: unknown,
	path: PropertyPath,
	value: JsonValue,
): unknown {
	const [head, ...rest] = path;
	const key = String(head);
	const base: Record<string, unknown> =
		typeof current === "object" && current !== null && !Array.isArray(current)
			? { ...(current as Record<string, unknown>) }
			: {};
	base[key] = rest.length === 0 ? value : setDeep(base[key], rest, value);
	return base;
}

/**
 * Promote an instance override into the definition default
 * (freeze §3.5). One reduction: the definition gains the value and
 * bumps its revision, and the instance loses the now-redundant
 * override — so every *other* instance moves and this one does not
 * visibly change.
 *
 * Only prop-rooted addresses promote: the authoring families are
 * per-node presentation, not definition defaults, so a family address
 * is a noop here rather than a silent partial promote.
 */
export function promoteComponentOverride(
	state: AuthoringStateV1,
	instanceNodeId: string,
	target: ComponentOverrideTarget,
	layer: ResponsiveLayerRef,
): AuthoringStateV1 {
	const record = state.nodes[instanceNodeId];
	const instance = record?.componentInstance;
	if (record === undefined || instance === undefined) {
		return state;
	}
	const definition = state.componentDefinitions[instance.definitionId];
	if (definition === undefined) {
		return state;
	}
	const patch = instance.nodeOverrides[target.definitionNodeId];
	if (patch === undefined) {
		return state;
	}
	const { member, rest } = addressOf(target.propertyPath);
	if (member !== "props" || rest.length === 0) {
		return state;
	}
	const value = readAtPath(patch.props, rest);
	if (value === undefined) {
		return state;
	}

	const nextDefinition = writeDefinitionProp(
		definition,
		target.definitionNodeId,
		rest,
		value as JsonValue,
	);
	if (nextDefinition === undefined) {
		return state;
	}

	// Remove the redundant instance override in the same reduction.
	const cleared = resetComponentOverride(state, instanceNodeId, target, layer);
	return {
		...cleared,
		componentDefinitions: {
			...cleared.componentDefinitions,
			[definition.id]: {
				...nextDefinition,
				revision: definition.revision + 1,
			},
		},
	};
}
