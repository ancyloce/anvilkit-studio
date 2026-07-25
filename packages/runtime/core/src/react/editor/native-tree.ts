"use client";

/**
 * @file Native Puck-tree transforms for Core-owned mutation surfaces
 * (PLAN-0020 CORE-P1A-016 tier (a)).
 *
 * Pure helpers that produce the next `Data` for duplicate/delete so
 * the tree change and the sidecar reconciliation can commit in **one**
 * history-recording dispatch (single-intent rule): duplication
 * deep-copies a subtree with fresh ids across all three containment
 * channels (root content, `zones`, slot-prop arrays) and reports the
 * old→new id map for `remapForDuplicate`; removal drops the subtree
 * and its zones so `reconcileAuthoringState` can strip records in the
 * same commit. Puck's own `duplicate`/`remove` reducers remain the
 * path when the editor is off — these helpers exist because native
 * actions cannot carry the sidecar write atomically.
 */

import type { Data as PuckData } from "@puckeditor/core";
import { generateNodeId } from "../../studio/layout/sidebar/commands/insert-component-node.js";

interface ComponentNode {
	readonly type: string;
	readonly props: Record<string, unknown>;
}

function isComponentNode(value: unknown): value is ComponentNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { props?: unknown }).props === "object"
	);
}

function nodeId(node: ComponentNode): string | undefined {
	const id = node.props.id;
	return typeof id === "string" && id.length > 0 ? id : undefined;
}

type Zones = Record<string, readonly unknown[]>;

function zonesOf(data: PuckData): Zones {
	return ((data as { zones?: Zones }).zones ?? {}) as Zones;
}

/** Collect a node's subtree ids (self + slots + zones, recursively). */
function collectSubtreeIds(
	node: ComponentNode,
	zones: Zones,
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
 * Deep-copy a node with fresh ids: slot-prop children recurse; the
 * subtree's `zones` entries are cloned under the copied ids into
 * `zoneAccum`; every old→new pair lands in `idMap`.
 */
function cloneNode(
	node: ComponentNode,
	zones: Zones,
	idMap: Record<string, string>,
	zoneAccum: Record<string, unknown[]>,
): ComponentNode {
	const oldId = nodeId(node);
	const newId = generateNodeId(node.type);
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node.props)) {
		if (Array.isArray(value) && value.some(isComponentNode)) {
			props[key] = value.map((entry) =>
				isComponentNode(entry)
					? cloneNode(entry, zones, idMap, zoneAccum)
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
						? cloneNode(entry, zones, idMap, zoneAccum)
						: entry,
				);
			}
		}
	}
	return { type: node.type, props };
}

/**
 * Map every containment array (root content, zone lists, slot props)
 * through `transform`, sharing untouched structure by reference.
 */
function transformContainers(
	data: PuckData,
	transform: (items: readonly unknown[]) => readonly unknown[],
): PuckData {
	const mapNode = (entry: unknown): unknown => {
		if (!isComponentNode(entry)) {
			return entry;
		}
		let changed = false;
		const props: Record<string, unknown> = { ...entry.props };
		for (const [key, value] of Object.entries(entry.props)) {
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
		return changed ? { type: entry.type, props } : entry;
	};

	const content = transform((data.content ?? []) as readonly unknown[]).map(
		mapNode,
	);
	const zones = zonesOf(data);
	const nextZones: Record<string, readonly unknown[]> = {};
	for (const [zoneKey, items] of Object.entries(zones)) {
		nextZones[zoneKey] = transform(items).map(mapNode);
	}
	return {
		...data,
		content,
		zones: nextZones,
	} as PuckData;
}

/** The result of a one-dispatch duplication. */
export interface DuplicateNodeResult {
	readonly data: PuckData;
	/** Old→new id for every node in the copied subtree. */
	readonly idMap: Readonly<Record<string, string>>;
	/** The copy's root node id (selection target). */
	readonly newRootId: string;
}

/**
 * Duplicate `targetId`'s subtree in place (copy inserted right after
 * the original in its container). Returns `null` when the id is not
 * found.
 */
export function duplicateNode(
	data: PuckData,
	targetId: string,
): DuplicateNodeResult | null {
	const zones = zonesOf(data);
	const idMap: Record<string, string> = {};
	const zoneAccum: Record<string, unknown[]> = {};
	let cloned = false;

	const next = transformContainers(data, (items) => {
		if (cloned) {
			return items;
		}
		const index = items.findIndex(
			(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
		);
		if (index === -1) {
			return items;
		}
		const source = items[index] as ComponentNode;
		const copy = cloneNode(source, zones, idMap, zoneAccum);
		cloned = true;
		return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
	});
	if (!cloned) {
		return null;
	}
	const newRootId = idMap[targetId];
	if (newRootId === undefined) {
		return null;
	}
	return {
		data: {
			...next,
			zones: { ...zonesOf(next), ...zoneAccum },
		} as PuckData,
		idMap,
		newRootId,
	};
}

/**
 * Remove `targetId`'s subtree (container entry + every zone the
 * subtree owns). Returns `null` when the id is not found.
 */
export function removeNode(data: PuckData, targetId: string): PuckData | null {
	const zones = zonesOf(data);
	let removedNode: ComponentNode | null = null;

	const next = transformContainers(data, (items) => {
		if (removedNode !== null) {
			return items;
		}
		const index = items.findIndex(
			(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
		);
		if (index === -1) {
			return items;
		}
		removedNode = items[index] as ComponentNode;
		return [...items.slice(0, index), ...items.slice(index + 1)];
	});
	if (removedNode === null) {
		return null;
	}
	const removedIds = new Set<string>();
	collectSubtreeIds(removedNode, zones, removedIds);
	const nextZones: Record<string, readonly unknown[]> = {};
	for (const [zoneKey, items] of Object.entries(zonesOf(next))) {
		const owner = zoneKey.split(":")[0] ?? "";
		if (!removedIds.has(owner)) {
			nextZones[zoneKey] = items;
		}
	}
	return { ...next, zones: nextZones } as PuckData;
}

/**
 * Wrap `targetId` in a fresh `containerType` node: the container
 * takes the node's place in its containment array and the node moves
 * into the container's `slotName` zone (CORE-P1A-017 wrap; the
 * canvas multi-select variant is CORE-P1B-013).
 */
export function wrapNode(
	data: PuckData,
	targetId: string,
	containerType: string,
	slotName: string,
): { readonly data: PuckData; readonly containerId: string } | null {
	const containerId = generateNodeId(containerType);
	let wrapped: ComponentNode | null = null;
	const next = transformContainers(data, (items) => {
		if (wrapped !== null) {
			return items;
		}
		const index = items.findIndex(
			(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
		);
		if (index === -1) {
			return items;
		}
		wrapped = items[index] as ComponentNode;
		const container: ComponentNode = {
			type: containerType,
			props: { id: containerId },
		};
		return [...items.slice(0, index), container, ...items.slice(index + 1)];
	});
	if (wrapped === null) {
		return null;
	}
	return {
		data: {
			...next,
			zones: {
				...zonesOf(next),
				[`${containerId}:${slotName}`]: [wrapped],
			},
		} as PuckData,
		containerId,
	};
}

/**
 * Unwrap `targetId`: its zone children take its place in document
 * order and the node (with its now-empty zones) disappears
 * (CORE-P1A-017 unwrap). Nodes without zone children return `null`.
 */
export function unwrapNode(data: PuckData, targetId: string): PuckData | null {
	const zones = zonesOf(data);
	const ownZoneKeys = Object.keys(zones).filter((zoneKey) =>
		zoneKey.startsWith(`${targetId}:`),
	);
	const children = ownZoneKeys.flatMap((zoneKey) => zones[zoneKey] ?? []);
	if (children.length === 0) {
		return null;
	}
	let replaced = false;
	const next = transformContainers(data, (items) => {
		if (replaced) {
			return items;
		}
		const index = items.findIndex(
			(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
		);
		if (index === -1) {
			return items;
		}
		replaced = true;
		return [...items.slice(0, index), ...children, ...items.slice(index + 1)];
	});
	if (!replaced) {
		return null;
	}
	const nextZones: Record<string, readonly unknown[]> = {};
	for (const [zoneKey, items] of Object.entries(zonesOf(next))) {
		if (!zoneKey.startsWith(`${targetId}:`)) {
			nextZones[zoneKey] = items;
		}
	}
	return { ...next, zones: nextZones } as PuckData;
}

/**
 * Write one prop (structural path) on `targetId`'s node — the inline
 * commit path (CORE-P1B-009H): the value lands in component props via
 * one `commitNative` dispatch, never in the sidecar.
 */
export function setNodeProp(
	data: PuckData,
	targetId: string,
	path: readonly (string | number)[],
	value: unknown,
): PuckData | null {
	if (path.length === 0) {
		return null;
	}
	let replaced = false;
	const next = transformContainers(data, (items) => {
		if (replaced) {
			return items;
		}
		const index = items.findIndex(
			(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
		);
		if (index === -1) {
			return items;
		}
		replaced = true;
		const node = items[index] as ComponentNode;
		const setAt = (
			host: unknown,
			segments: readonly (string | number)[],
		): unknown => {
			const [head, ...rest] = segments;
			if (head === undefined) {
				return value;
			}
			if (Array.isArray(host)) {
				const copy = [...host];
				copy[Number(head)] = setAt(copy[Number(head)], rest);
				return copy;
			}
			const record =
				typeof host === "object" && host !== null
					? { ...(host as Record<string, unknown>) }
					: {};
			record[String(head)] = setAt(record[String(head)], rest);
			return record;
		};
		const props = setAt(node.props, path) as Record<string, unknown>;
		return [
			...items.slice(0, index),
			{ type: node.type, props },
			...items.slice(index + 1),
		];
	});
	return replaced ? next : null;
}

/**
 * Read one node's props from the live tree (content, zones, slot
 * props) — the prop-read counterpart of {@link setNodeProp}.
 */
export function findNodeProps(
	data: PuckData,
	targetId: string,
): Record<string, unknown> | null {
	let found: Record<string, unknown> | null = null;
	const visit = (items: readonly unknown[] | undefined): void => {
		for (const entry of items ?? []) {
			if (found !== null) {
				return;
			}
			if (!isComponentNode(entry)) {
				continue;
			}
			if (nodeId(entry) === targetId) {
				found = entry.props;
				return;
			}
			for (const value of Object.values(entry.props)) {
				if (Array.isArray(value)) {
					visit(value);
				}
			}
		}
	};
	visit((data.content ?? []) as readonly unknown[]);
	for (const zone of Object.values(zonesOf(data))) {
		visit(zone);
	}
	return found;
}
