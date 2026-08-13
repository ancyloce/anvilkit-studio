"use client";

/**
 * @file Native Puck-tree transforms for Core-owned mutation surfaces
 * (PLAN-0020 CORE-P1A-016 tier (a); slot addressing corrected per
 * review 0036 H-3/M-6).
 *
 * Pure helpers that produce the next `Data` for duplicate/delete/wrap
 * so the tree change and the sidecar reconciliation can commit in
 * **one** history-recording dispatch (single-intent rule). Puck's own
 * `duplicate`/`remove` reducers remain the path when the editor is off
 * — these helpers exist because native actions cannot carry the
 * sidecar write atomically.
 *
 * Every helper now takes the live `Config`, because that is the only
 * authority on where a component keeps its children: slot content lives
 * in `props.<slot>`, and a slot is a slot because the config says
 * `fields.<slot>.type === "slot"` — not because the value happens to be
 * a non-empty array of nodes. See `editor/tree/nodes.ts` for the full
 * rationale.
 *
 * `wrapNode` in particular used to park the wrapped child in
 * `data.zones["<containerId>:<slot>"]` — Puck's *legacy* DropZone map —
 * while creating the container with no slot prop at all. A slot-field
 * container renders `props.<slot>`, so the child vanished from the
 * canvas while still sitting in the document (review 0036 H-3). The
 * child now goes where the container will actually render it.
 */

import type { Config, Data as PuckData } from "@puckeditor/core";
import {
	cloneSubtree,
	collectSubtreeIds,
	findNode,
	isComponentNode,
	nodeId,
	type PuckTreeNode,
	type PuckZones,
	slotFieldNames,
	transformContainers,
	zonesOf,
} from "../../editor/tree/nodes.js";
import { generateNodeId } from "../../studio/layout/sidebar/commands/insert-component-node.js";

/** Local alias kept so the existing call sites read unchanged. */
type ComponentNode = PuckTreeNode;
type Zones = PuckZones;

/**
 * Allocates the node ids a copy takes, given the copied node's type and
 * the id of the node it was copied FROM.
 */
export type NodeIdAllocator = (
	type: string,
	sourceId: string | undefined,
) => string;

/** The default: a fresh id every time, as these helpers always did. */
const freshIds: NodeIdAllocator = (type) => generateNodeId(type);

/**
 * An allocator that answers the same id for the same source node every
 * time it is asked (review 0036 M-1).
 *
 * The commit protocol these helpers sit behind is
 * `previous === current ? result.data : run(previous).data` — on a
 * document that moved between validation and the reducer, `run` executes
 * a **second time**. That is only sound while `run` is deterministic,
 * and id generation is not: `generateNodeId` is a random UUID. So the
 * retry minted a different set of ids than the ones already handed back
 * to the caller as `createdNodeIds`, and the caller then selected a node
 * that did not exist.
 *
 * Keying by source id rather than by call order means the replay stays
 * correct even when the concurrent write changed the subtree: every node
 * that still exists keeps the id it was already promised, and anything
 * genuinely new gets a fresh one. A node with no id of its own cannot
 * appear in `idMap` (and therefore never in `createdNodeIds`), so it is
 * left to the fresh path.
 *
 * Create ONE per user intent, OUTSIDE the `run` closure.
 */
export function createStableIdAllocator(
	generate: (type: string) => string = generateNodeId,
): NodeIdAllocator {
	const bySource = new Map<string, string>();
	return (type, sourceId) => {
		if (sourceId === undefined) {
			return generate(type);
		}
		const existing = bySource.get(sourceId);
		if (existing !== undefined) {
			return existing;
		}
		const fresh = generate(type);
		bySource.set(sourceId, fresh);
		return fresh;
	};
}

/** Bind the id allocator into the pure clone primitive. */
const cloneNode = (
	node: ComponentNode,
	config: Config,
	zones: Zones,
	idMap: Record<string, string>,
	zoneAccum: Record<string, unknown[]>,
	allocate: NodeIdAllocator,
): ComponentNode =>
	cloneSubtree(node, config, zones, allocate, idMap, zoneAccum);

/** Index of `targetId` within `items`, or `-1`. */
function indexOfNode(items: readonly unknown[], targetId: string): number {
	return items.findIndex(
		(entry) => isComponentNode(entry) && nodeId(entry) === targetId,
	);
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
	config: Config,
	allocate: NodeIdAllocator = freshIds,
): DuplicateNodeResult | null {
	const zones = zonesOf(data);
	const idMap: Record<string, string> = {};
	const zoneAccum: Record<string, unknown[]> = {};
	let cloned = false;

	const next = transformContainers(data, config, (items) => {
		if (cloned) {
			return items;
		}
		const index = indexOfNode(items, targetId);
		if (index === -1) {
			return items;
		}
		const source = items[index] as ComponentNode;
		const copy = cloneNode(source, config, zones, idMap, zoneAccum, allocate);
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
	const accumulated = Object.keys(zoneAccum).length > 0;
	return {
		data: accumulated
			? ({ ...next, zones: { ...zonesOf(next), ...zoneAccum } } as PuckData)
			: next,
		idMap,
		newRootId,
	};
}

/**
 * Remove `targetId`'s subtree (container entry + every legacy zone the
 * subtree owns). Returns `null` when the id is not found.
 */
export function removeNode(
	data: PuckData,
	targetId: string,
	config: Config,
): PuckData | null {
	const zones = zonesOf(data);
	let removedNode: ComponentNode | null = null;

	const next = transformContainers(data, config, (items) => {
		if (removedNode !== null) {
			return items;
		}
		const index = indexOfNode(items, targetId);
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
	collectSubtreeIds(removedNode, config, zones, removedIds);
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
 * Wrap `targetId` in a fresh `containerType` node: the container takes
 * the node's place in its containment array and the node moves into the
 * container's `slotName` **slot prop** (CORE-P1A-017 wrap; the canvas
 * multi-select variant is CORE-P1B-013).
 */
export function wrapNode(
	data: PuckData,
	targetId: string,
	containerType: string,
	slotName: string,
	config: Config,
	allocate: NodeIdAllocator = freshIds,
): { readonly data: PuckData; readonly containerId: string } | null {
	// Same retry hazard as duplication (review 0036 M-1): `commitTree`
	// re-runs this transform when the document moved, and the caller has
	// already selected the container id from the first run. Keying the
	// allocation on the wrapped node makes the replay produce the same
	// container.
	const containerId = allocate(containerType, targetId);
	let wrapped: ComponentNode | null = null;
	const next = transformContainers(data, config, (items) => {
		if (wrapped !== null) {
			return items;
		}
		const index = indexOfNode(items, targetId);
		if (index === -1) {
			return items;
		}
		const source = items[index] as ComponentNode;
		wrapped = source;
		const container: ComponentNode = {
			type: containerType,
			// The child goes in the slot the container actually renders.
			props: { id: containerId, [slotName]: [source] },
		};
		return [...items.slice(0, index), container, ...items.slice(index + 1)];
	});
	if (wrapped === null) {
		return null;
	}
	return { data: next, containerId };
}

/**
 * Unwrap `targetId`: its children take its place in document order and
 * the node disappears (CORE-P1A-017 unwrap).
 *
 * Children are read from the node's declared slots first, then from any
 * legacy zones it still owns, so both document shapes unwrap. Nodes
 * with no children return `null`.
 */
export function unwrapNode(
	data: PuckData,
	targetId: string,
	config: Config,
): PuckData | null {
	const target = findNode(data, targetId, config);
	if (target === undefined) {
		return null;
	}
	const zones = zonesOf(data);
	const slotChildren = slotFieldNames(config, target.type).flatMap(
		(slotName) => {
			const value = target.props[slotName];
			return Array.isArray(value) ? (value as unknown[]) : [];
		},
	);
	const ownZoneKeys = Object.keys(zones).filter((zoneKey) =>
		zoneKey.startsWith(`${targetId}:`),
	);
	const children = [
		...slotChildren,
		...ownZoneKeys.flatMap((zoneKey) => [...(zones[zoneKey] ?? [])]),
	];
	if (children.length === 0) {
		return null;
	}
	let replaced = false;
	const next = transformContainers(data, config, (items) => {
		if (replaced) {
			return items;
		}
		const index = indexOfNode(items, targetId);
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
	config: Config,
): PuckData | null {
	if (path.length === 0) {
		return null;
	}
	let replaced = false;
	const next = transformContainers(data, config, (items) => {
		if (replaced) {
			return items;
		}
		const index = indexOfNode(items, targetId);
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
		// Spread the node so `readOnly` (and any future `BaseData`
		// sibling) survives the write.
		return [
			...items.slice(0, index),
			{ ...node, type: node.type, props },
			...items.slice(index + 1),
		];
	});
	return replaced ? next : null;
}

/**
 * Read one node's props from the live tree — the prop-read counterpart
 * of {@link setNodeProp}.
 */
export function findNodeProps(
	data: PuckData,
	targetId: string,
	config: Config,
): Record<string, unknown> | null {
	return findNode(data, targetId, config)?.props ?? null;
}
