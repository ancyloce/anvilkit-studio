/**
 * @file Pure Puck-tree primitives (PLAN-0020 CORE-P2-004; extracted
 * from `react/editor/native-tree.ts`, CORE-P1A-016/P1B).
 *
 * Puck stores children in **three** containment channels and every
 * walk must cover all of them:
 *
 * 1. `data.content` — the classic top-level array;
 * 2. `data.zones["<nodeId>:<slot>"]` — the legacy zone map;
 * 3. slot-shaped props (`props.<slot>: Node[]`), including on
 *    **`data.root.props`** — Puck 0.22 slot documents put top-level
 *    children there instead of `content`. Missing that channel made
 *    every native-tree op a silent no-op on the reference app
 *    (the highest-value defect found in Phase 1B); it is covered here
 *    so component creation and detach cannot regress the same way.
 *
 * React-free and Puck-runtime-free: the only Puck reference is
 * `import type`, so this module is importable from
 * `@anvilkit/core/editor`.
 */

import type { Data as PuckData } from "@puckeditor/core";

/** A serializable Puck node as it appears inside `Data`. */
export interface PuckTreeNode {
	readonly type: string;
	readonly props: Record<string, unknown>;
}

/** The legacy zone map. */
export type PuckZones = Record<string, readonly unknown[]>;

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

/** The document's zone map. */
export function zonesOf(data: PuckData): PuckZones {
	return ((data as { zones?: PuckZones }).zones ?? {}) as PuckZones;
}

/** Collect a node's subtree ids (self + slot props + zones). */
export function collectSubtreeIds(
	node: PuckTreeNode,
	zones: PuckZones,
	into: Set<string>,
): void {
	const id = nodeId(node);
	if (id !== undefined) {
		into.add(id);
	}
	for (const value of Object.values(node.props)) {
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (isComponentNode(entry)) {
					collectSubtreeIds(entry, zones, into);
				}
			}
		}
	}
	if (id !== undefined) {
		for (const [zoneKey, items] of Object.entries(zones)) {
			if (zoneKey.startsWith(`${id}:`)) {
				for (const entry of items) {
					if (isComponentNode(entry)) {
						collectSubtreeIds(entry, zones, into);
					}
				}
			}
		}
	}
}

/**
 * Map every containment array through `transform`, sharing untouched
 * structure by reference.
 */
export function transformContainers(
	data: PuckData,
	transform: (items: readonly unknown[]) => readonly unknown[],
): PuckData {
	const mapSlotProps = (
		source: Readonly<Record<string, unknown>>,
	): Record<string, unknown> | null => {
		let changed = false;
		const props: Record<string, unknown> = { ...source };
		for (const [key, value] of Object.entries(source)) {
			if (Array.isArray(value) && value.some(isComponentNode)) {
				const next = transform(value).map(mapNode);
				if (
					next.length !== value.length ||
					next.some((item, index) => item !== value[index])
				) {
					props[key] = next;
					changed = true;
				}
			}
		}
		return changed ? props : null;
	};

	const mapNode = (entry: unknown): unknown => {
		if (!isComponentNode(entry)) {
			return entry;
		}
		const props = mapSlotProps(entry.props);
		return props === null ? entry : { type: entry.type, props };
	};

	const content = transform((data.content ?? []) as readonly unknown[]).map(
		mapNode,
	);
	const zones = zonesOf(data);
	const nextZones: Record<string, readonly unknown[]> = {};
	for (const [zoneKey, items] of Object.entries(zones)) {
		nextZones[zoneKey] = transform(items).map(mapNode);
	}
	const rootProps = data.root?.props;
	const nextRootProps =
		rootProps === undefined || rootProps === null
			? null
			: mapSlotProps(rootProps as Readonly<Record<string, unknown>>);

	return {
		...data,
		...(nextRootProps === null
			? {}
			: { root: { ...data.root, props: nextRootProps } }),
		content,
		zones: nextZones,
	} as PuckData;
}

/**
 * Deep-copy a node with fresh ids from `generateId`. Slot-prop
 * children recurse; the subtree's `zones` entries are cloned under the
 * copied ids into `zoneAccum`; every old→new pair lands in `idMap`.
 */
export function cloneSubtree(
	node: PuckTreeNode,
	zones: PuckZones,
	generateId: (type: string) => string,
	idMap: Record<string, string>,
	zoneAccum: Record<string, unknown[]>,
): PuckTreeNode {
	const oldId = nodeId(node);
	const newId = generateId(node.type);
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node.props)) {
		if (Array.isArray(value) && value.some(isComponentNode)) {
			props[key] = value.map((entry) =>
				isComponentNode(entry)
					? cloneSubtree(entry, zones, generateId, idMap, zoneAccum)
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
						? cloneSubtree(entry, zones, generateId, idMap, zoneAccum)
						: entry,
				);
			}
		}
	}
	return { type: node.type, props };
}

/** Where a node sits: its container array and index within it. */
export interface NodeLocation {
	/**
	 * Container key: `"content"`, a zone key (`"<id>:<slot>"`), or a
	 * slot-prop path (`"<ownerId|root>.<slot>"`).
	 */
	readonly container: string;
	readonly index: number;
	readonly node: PuckTreeNode;
}

function scanArray(
	container: string,
	items: readonly unknown[],
	into: Map<string, NodeLocation>,
): void {
	items.forEach((entry, index) => {
		if (!isComponentNode(entry)) {
			return;
		}
		const id = nodeId(entry);
		if (id !== undefined && !into.has(id)) {
			into.set(id, { container, index, node: entry });
		}
		for (const [key, value] of Object.entries(entry.props)) {
			if (Array.isArray(value) && value.some(isComponentNode)) {
				scanArray(`${id ?? "?"}.${key}`, value, into);
			}
		}
	});
}

/**
 * Index every node in the document by id, recording the container it
 * lives in and its position there. Used to prove a multi-node
 * selection shares one container and has an expressible order
 * (DD-0019 §14.3).
 */
export function indexNodeLocations(
	data: PuckData,
): ReadonlyMap<string, NodeLocation> {
	const into = new Map<string, NodeLocation>();
	scanArray("content", (data.content ?? []) as readonly unknown[], into);
	for (const [zoneKey, items] of Object.entries(zonesOf(data))) {
		scanArray(zoneKey, items, into);
	}
	const rootProps = data.root?.props as
		| Readonly<Record<string, unknown>>
		| undefined;
	for (const [key, value] of Object.entries(rootProps ?? {})) {
		if (Array.isArray(value) && value.some(isComponentNode)) {
			scanArray(`root.${key}`, value, into);
		}
	}
	return into;
}

/** Find one node by id. */
export function findNode(
	data: PuckData,
	targetId: string,
): PuckTreeNode | undefined {
	return indexNodeLocations(data).get(targetId)?.node;
}
