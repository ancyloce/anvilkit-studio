/**
 * @file Pure Puck-tree primitives (PLAN-0020 CORE-P2-004; extracted
 * from the former `react/editor/native-tree.ts`, CORE-P1A-016/P1B;
 * slot-addressing
 * consolidated per review 0036 H-2/H-3/M-6).
 *
 * ## Where Puck actually keeps children
 *
 * In `@puckeditor/core@0.23.0` a component's slot children live **in
 * its own props** — `ComponentData.props` is
 * `WithDeepSlots<WithId<Props>, Content>`, and `WithDeepSlots` recurses
 * through object and array fields, so a slot may sit at
 * `props.<slot>`, `props.<object>.<slot>` or `props.<array>[i].<slot>`.
 * `data.zones` is the **legacy DropZone map**: Puck's `migrate()` exists
 * to move those entries into slot props and throws on any it cannot
 * place.
 *
 * ## Slot identity comes from the Config, never from the value
 *
 * These walks used to recognise a slot by inspecting the runtime value
 * (`Array.isArray(v) && v.some(isComponentNode)`). That is wrong in two
 * directions: an **empty** slot (`props.children = []`) matched
 * nothing, so it was invisible to every walk and could not be inserted
 * into; and a slot nested inside an object field was never reached at
 * all. Both are review 0036 M-6.
 *
 * The walk is now Puck's own {@link walkTree}, which resolves slots
 * from `config.components[type].fields[key].type === "slot"` and
 * defaults every declared-but-absent slot to `[]` before visiting it.
 * That makes empty and nested slots first-class, and it is the public
 * surface the Puck contract (CLAUDE.md rule 4) requires — the same call
 * `update-appearance`, `update-variants`, `update-carriers`,
 * `update-instance-overrides` and `read-appearance` already make.
 *
 * ## Legacy zones: still read, never written
 *
 * `walkTree` walks *inside* legacy zone content but does not offer the
 * zone arrays themselves as containers. {@link transformContainers}
 * therefore visits them in a second pass, so a pre-migration document
 * still reorders/deletes correctly. Nothing here ever **creates** a
 * zone entry any more — writes always land in slot props.
 *
 * React-free. Puck enters as a runtime import (`walkTree`) exactly as
 * it already does across `src/puck/*`; `@puckeditor/core` is a
 * peerDependency, so it stays external to the bundle.
 */

import type { Config, Data as PuckData } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";

/** A serializable Puck node as it appears inside `Data`. */
export interface PuckTreeNode {
	readonly type: string;
	readonly props: Record<string, unknown>;
}

/** The legacy zone map. */
export type PuckZones = Record<string, readonly unknown[]>;

/** Puck's parent id for the document's top-level content. */
export const ROOT_PARENT_ID = "root";

/** Puck's prop name for the document's top-level content. */
export const ROOT_PROP_NAME = "default-zone";

/**
 * Where one containment array lives, in Puck's own `walkTree`
 * coordinates.
 *
 * These are the same two halves the zone-id string spells, which is why
 * `"<parentId>:<propName>"` addresses a slot and `"root:default-zone"`
 * addresses top-level content — see {@link containerZoneId}.
 */
export interface ContainerAddress {
	/** Owning node id, or `"root"` for top-level content. */
	readonly parentId: string;
	/** Slot field name, or `"default-zone"` for top-level content. */
	readonly propName: string;
}

/** The `"<parentId>:<propName>"` zone id these coordinates spell. */
export function containerZoneId(at: ContainerAddress): string {
	return `${at.parentId}:${at.propName}`;
}

/** Split a `"<parentId>:<propName>"` zone id back into coordinates. */
export function parseZoneId(zoneId: string): ContainerAddress {
	const separator = zoneId.indexOf(":");
	if (separator === -1) {
		return { parentId: ROOT_PARENT_ID, propName: zoneId };
	}
	return {
		parentId: zoneId.slice(0, separator),
		propName: zoneId.slice(separator + 1),
	};
}

/** True for a `{type, props}` component node. */
export function isComponentNode(value: unknown): value is PuckTreeNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

/** A node's stable id, when it has one. */
export function nodeId(node: PuckTreeNode): string | undefined {
	const id = node.props.id;
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** The document's legacy zone map. */
export function zonesOf(data: PuckData): PuckZones {
	return ((data as { zones?: PuckZones }).zones ?? {}) as PuckZones;
}

const NO_NAMES: readonly string[] = Object.freeze([]);

/**
 * The slot field names a component type DECLARES, per the config.
 *
 * The authority for "is this prop a slot" — never the prop's runtime
 * value, so a declared-but-empty slot still counts (review 0036 M-6).
 * An unregistered type declares nothing, which is the correct reading:
 * the editor cannot know a slot exists without a config entry for it.
 */
export function slotFieldNames(
	config: Config,
	type: string,
): readonly string[] {
	const componentConfig =
		type === ROOT_PARENT_ID
			? (config.root as { fields?: Record<string, { type?: string }> })
			: (config.components?.[type] as
					| { fields?: Record<string, { type?: string }> }
					| undefined);
	const fields = componentConfig?.fields;
	if (fields === undefined || fields === null) {
		return NO_NAMES;
	}
	return Object.keys(fields).filter((key) => fields[key]?.type === "slot");
}

/**
 * Map every containment array in the document through `transform`.
 *
 * Containers are addressed by {@link ContainerAddress}, so a transform
 * can target one specific slot (insert, reorder) or ignore the address
 * and act on all of them (delete, duplicate).
 *
 * Coverage, in order:
 *
 * 1. every config-declared slot — including empty ones and slots nested
 *    inside object/array fields — plus top-level `content`, via Puck's
 *    `walkTree`;
 * 2. any legacy `data.zones` array `walkTree` did not already offer,
 *    so pre-migration documents keep working.
 *
 * @throws When the document contains a component type that is missing
 * from `config.components`. That is Puck's own `walkTree` refusing to
 * recurse a slot it cannot describe; `walkAppState` would reject the
 * same document, so the editor could not be showing it. Commit helpers
 * catch this and report a diagnostic rather than letting it escape.
 */
export function transformContainers(
	data: PuckData,
	config: Config,
	transform: (
		items: readonly unknown[],
		at: ContainerAddress,
	) => readonly unknown[],
): PuckData {
	const visited = new Set<string>();
	let touchedAny = false;
	let touchedRootSlot = false;

	const walked = walkTree(data, config, (content, options) => {
		const at: ContainerAddress = {
			parentId: options.parentId,
			propName: options.propName,
		};
		visited.add(containerZoneId(at));
		const mapped = transform(content, at);
		if (mapped !== content) {
			touchedAny = true;
			if (at.parentId === ROOT_PARENT_ID && at.propName !== ROOT_PROP_NAME) {
				touchedRootSlot = true;
			}
		}
		return mapped as typeof content;
	});

	// Second pass: legacy DropZone arrays walkTree does not offer as
	// containers. Skipped entirely for the common (slot-native) document,
	// whose zone map is empty.
	const zones = zonesOf(walked);
	let nextZones: Record<string, readonly unknown[]> | null = null;
	for (const zoneKey of Object.keys(zones)) {
		// A slot already claimed these coordinates — a degenerate document
		// carrying both. The slot is authoritative; transforming the zone
		// too would apply the intent twice.
		if (visited.has(zoneKey)) {
			continue;
		}
		const items = zones[zoneKey] ?? [];
		const mapped = transform(items, parseZoneId(zoneKey));
		if (mapped !== items) {
			touchedAny = true;
			nextZones ??= { ...zones };
			nextZones[zoneKey] = mapped;
		}
	}

	// Reference preservation (PLAN-0020 Phase 0). `walkTree` rebuilds
	// every node it visits, so handing its output back unconditionally
	// would report the whole document as changed on an operation that
	// touched nothing — and would rebuild `root` for an edit that only
	// moved something in `content`. A transform signals "unchanged" by
	// returning the array it was given, which is what these two
	// restorations key off.
	if (!touchedAny) {
		return data;
	}
	let next =
		nextZones === null ? walked : ({ ...walked, zones: nextZones } as PuckData);
	if (!touchedRootSlot && data.root !== undefined) {
		next = { ...next, root: data.root } as PuckData;
	}
	// `walkTree` always returns a `zones` key, so a slot-native document
	// that never had one came back carrying `zones: {}` — resurrecting
	// Puck's deprecated map on every edit (review 0036 L-7). Drop it again
	// when the input had none and nothing put anything there.
	if (
		!("zones" in (data as object)) &&
		Object.keys(zonesOf(next)).length === 0
	) {
		const { zones: _dropped, ...rest } = next as PuckData & {
			zones?: PuckZones;
		};
		return rest as PuckData;
	}
	return next;
}

/** Collect a node's subtree ids (self + declared slots + legacy zones). */
export function collectSubtreeIds(
	node: PuckTreeNode,
	config: Config,
	zones: PuckZones,
	into: Set<string>,
): void {
	const id = nodeId(node);
	if (id !== undefined) {
		into.add(id);
	}
	for (const slotName of slotFieldNames(config, node.type)) {
		const value = node.props[slotName];
		if (!Array.isArray(value)) {
			continue;
		}
		for (const entry of value) {
			if (isComponentNode(entry)) {
				collectSubtreeIds(entry, config, zones, into);
			}
		}
	}
	if (id !== undefined) {
		for (const [zoneKey, items] of Object.entries(zones)) {
			if (zoneKey.startsWith(`${id}:`)) {
				for (const entry of items) {
					if (isComponentNode(entry)) {
						collectSubtreeIds(entry, config, zones, into);
					}
				}
			}
		}
	}
}

/**
 * Deep-copy a node with fresh ids from `generateId`. Declared-slot
 * children recurse; the subtree's legacy `zones` entries are cloned
 * under the copied ids into `zoneAccum`; every old→new pair lands in
 * `idMap`.
 *
 * `generateId` receives the SOURCE node's id alongside its type. That
 * is what lets a caller hand in an allocator which is stable across
 * repeated runs of the same intent — see `createStableIdAllocator` in
 * `editor/tree/transforms.ts` (review 0036 M-1).
 */
export function cloneSubtree(
	node: PuckTreeNode,
	config: Config,
	zones: PuckZones,
	generateId: (type: string, sourceId: string | undefined) => string,
	idMap: Record<string, string>,
	zoneAccum: Record<string, unknown[]>,
): PuckTreeNode {
	const oldId = nodeId(node);
	const newId = generateId(node.type, oldId);
	const slots = new Set(slotFieldNames(config, node.type));
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node.props)) {
		if (slots.has(key) && Array.isArray(value)) {
			props[key] = value.map((entry) =>
				isComponentNode(entry)
					? cloneSubtree(entry, config, zones, generateId, idMap, zoneAccum)
					: entry,
			);
		} else {
			props[key] = value;
		}
	}
	props.id = newId;
	if (oldId !== undefined) {
		idMap[oldId] = newId;
		for (const [zoneKey, items] of Object.entries(zones)) {
			if (zoneKey.startsWith(`${oldId}:`)) {
				const slot = zoneKey.slice(oldId.length + 1);
				zoneAccum[`${newId}:${slot}`] = items.map((entry) =>
					isComponentNode(entry)
						? cloneSubtree(entry, config, zones, generateId, idMap, zoneAccum)
						: entry,
				);
			}
		}
	}
	// Spread the source so Puck's own per-node state (`readOnly`) and any
	// future `BaseData` sibling survive the copy.
	return { ...node, type: node.type, props };
}

/** Where a node sits: its container array and index within it. */
export interface NodeLocation {
	/**
	 * Container id in {@link containerZoneId} form — `"root:default-zone"`
	 * for top-level content, `"<ownerId>:<slot>"` for a slot.
	 */
	readonly container: string;
	readonly index: number;
	readonly node: PuckTreeNode;
}

/**
 * Index every node in the document by id, recording the container it
 * lives in and its position there. Used to prove a multi-node
 * selection shares one container and has an expressible order
 * (DD-0019 §14.3).
 *
 * First-wins on a duplicate id, which a well-formed document does not
 * contain.
 */
export function indexNodeLocations(
	data: PuckData,
	config: Config,
): ReadonlyMap<string, NodeLocation> {
	const into = new Map<string, NodeLocation>();
	transformContainers(data, config, (items, at) => {
		const container = containerZoneId(at);
		items.forEach((entry, index) => {
			if (!isComponentNode(entry)) {
				return;
			}
			const id = nodeId(entry);
			if (id !== undefined && !into.has(id)) {
				into.set(id, { container, index, node: entry });
			}
		});
		return items;
	});
	return into;
}

/** Find one node by id. */
export function findNode(
	data: PuckData,
	targetId: string,
	config: Config,
): PuckTreeNode | undefined {
	return indexNodeLocations(data, config).get(targetId)?.node;
}
