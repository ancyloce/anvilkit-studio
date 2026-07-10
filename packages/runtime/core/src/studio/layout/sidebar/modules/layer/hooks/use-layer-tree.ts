/**
 * @file `useLayerTree()` — reactive Puck view-model for the draggable
 * Layer tree, plus the pure `resolveDrop()` resolver.
 *
 * `<Puck.Outline />` is a black box, so the Layers panel renders its own
 * tree. This module projects a narrow, reactive slice of Puck state into
 * a recursive `LayerNode` model and exposes a side-effect-free helper
 * that turns a (source, destination) pair into the exact Puck action —
 * `reorder` for same-zone moves, `move` across zones — or `null` when
 * the drop would create a cycle (a component dropped into its own
 * descendant zone).
 *
 * Puck zone keys are compound `"<parentComponentId>:<slotName>"`. The
 * root list lives in `data.content` and is addressed by the compound
 * key `"root:default-zone"` (bare `default-zone` silently no-ops — see
 * `LayersPanel.tsx`). Component identity is `item.props.id`.
 */

import {
	type ComponentData,
	type Data,
	type PuckAction,
	useGetPuck,
} from "@puckeditor/core";
import { useMemo } from "react";
import { useReactivePuck } from "@/overrides/utils/use-reactive-puck";

/** Compound dispatch/selection key for the root content list. */
export const ROOT_ZONE = "root:default-zone";

export interface LayerChildZone {
	/** Puck `data.zones` key — also the dispatch `destinationZone`. */
	readonly zoneKey: string;
	/** Slot name (the part after `"<id>:"`). */
	readonly slotName: string;
	readonly items: readonly LayerNode[];
}

export interface LayerNode {
	readonly id: string;
	readonly type: string;
	readonly label: string;
	/** Dispatch zone key this node currently lives in. */
	readonly zone: string;
	/** Index within `zone`. */
	readonly index: number;
	/** Indentation depth (root = 0). */
	readonly depth: number;
	readonly childZones: readonly LayerChildZone[];
}

export interface LayerTreeModel {
	readonly roots: readonly LayerNode[];
	readonly selectedId: string | null;
}

export interface DropEndpoint {
	readonly zone: string;
	readonly index: number;
}

type ComponentList = readonly ComponentData[];

function componentId(item: ComponentData): string | null {
	const id = (item.props as { id?: unknown } | undefined)?.id;
	return typeof id === "string" ? id : null;
}

// ASCII control chars as separators so they can't collide with real
// component types, ids, or zone keys.
const FIELD_SEP = "\u001f";
const ZONE_SEP = "\u001e";

/**
 * A primitive fingerprint of everything `buildNodes` reads from `data`:
 * each item's `type` + `id` + order, plus the zone keys (in `Object.keys`
 * insertion order — `indexZonesByParent` depends on that order) and their
 * contents. Labels are excluded because they come from `config.components`,
 * which `useLayerTree` subscribes to separately.
 *
 * Puck replaces `appState.data` by reference on every edit (including
 * prop-only edits the Layer tree does not render). Subscribing to this
 * signature instead of the whole `data` object means the panel re-renders
 * and rebuilds the tree only when the structure actually changes.
 */
function topologySignature(data: Data): string {
	const parts: string[] = [];
	for (const item of data.content ?? []) {
		parts.push(item.type, componentId(item) ?? "");
	}
	const zones = (data.zones ?? {}) as Readonly<Record<string, ComponentList>>;
	for (const key of Object.keys(zones)) {
		parts.push(ZONE_SEP, key);
		for (const item of zones[key] ?? []) {
			parts.push(item.type, componentId(item) ?? "");
		}
	}
	return parts.join(FIELD_SEP);
}

/** `parentComponentId → [its compound zone keys]`, in zone insertion order. */
type ChildZonesByParent = ReadonlyMap<string, readonly string[]>;

/**
 * Index every zone key by its owning parent in a single O(zones) pass.
 *
 * Zone keys are compound `"<parentId>:<slotName>"`, so the parent is the
 * segment before the first `:`. Previously `buildNodes` rescanned all
 * zone keys for every node (`Object.keys(zones).filter(startsWith)`),
 * making tree construction O(nodes × zones); this lookup table makes it
 * O(nodes + zones). Insertion order of `Object.keys(zones)` is preserved
 * per parent, so child-zone order is byte-identical to the old filter.
 */
function indexZonesByParent(
	zones: Readonly<Record<string, ComponentList>>,
): ChildZonesByParent {
	const byParent = new Map<string, string[]>();
	for (const zoneKey of Object.keys(zones)) {
		const colon = zoneKey.indexOf(":");
		if (colon <= 0) continue;
		const parentId = zoneKey.slice(0, colon);
		const existing = byParent.get(parentId);
		if (existing) {
			existing.push(zoneKey);
		} else {
			byParent.set(parentId, [zoneKey]);
		}
	}
	return byParent;
}

function buildNodes(
	items: ComponentList,
	zone: string,
	depth: number,
	zones: Readonly<Record<string, ComponentList>>,
	childZonesByParent: ChildZonesByParent,
	labelFor: (type: string) => string,
): LayerNode[] {
	const out: LayerNode[] = [];
	items.forEach((item, index) => {
		const id = componentId(item);
		if (id === null) return;
		// `id.length + 1` strips the `"<id>:"` prefix to recover the slot
		// name — identical to the old `prefix.length` slice.
		const childZones: LayerChildZone[] = (childZonesByParent.get(id) ?? []).map(
			(zoneKey) => ({
				zoneKey,
				slotName: zoneKey.slice(id.length + 1),
				items: buildNodes(
					zones[zoneKey] ?? [],
					zoneKey,
					depth + 1,
					zones,
					childZonesByParent,
					labelFor,
				),
			}),
		);
		out.push({
			id,
			type: item.type,
			label: labelFor(item.type),
			zone,
			index,
			depth,
			childZones,
		});
	});
	return out;
}

/**
 * Subscribe to a narrow, reactive slice of Puck state and project it
 * into the recursive layer tree. Each `useReactivePuck` call selects a
 * primitive or a stable reference so re-renders track only real
 * structural/selection changes.
 */
export function useLayerTree(): LayerTreeModel {
	// Non-subscribing snapshot getter (stable across renders, like the rest of
	// the codebase treats it). The reactive trigger is `topology` below — the
	// memo reads fresh `data` from this getter only when it recomputes.
	const getPuck = useGetPuck();
	// Subscribe to a primitive structural fingerprint, NOT the whole
	// `appState.data` object. Puck swaps `data` by reference on every edit
	// (prop-only edits the tree never renders included), so subscribing to the
	// object re-walked + re-rendered the entire tree on every keystroke. This
	// re-renders only when the structure actually changes.
	const topology = useReactivePuck((s) =>
		topologySignature(s.appState.data as Data),
	);
	const selectedId = useReactivePuck(
		(s) => (s.selectedItem?.props as { id?: unknown } | undefined)?.id ?? null,
	);
	const components = useReactivePuck((s) => s.config.components);

	// Build the recursive projection only when the document structure
	// (`topology`) or the component map changes — NOT on selection (review
	// finding P-a) and NOT on non-structural prop edits. `selected` is resolved
	// per-row downstream (`selectedId === node.id`), so `selectedId` does not
	// belong in the projection memo.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `topology` is the structural fingerprint folded in as the reactive trigger — it intentionally is not referenced in the body (data is read non-reactively through `getPuck`), so prop-only edits that leave `topology` unchanged do not re-walk the tree. Removing it (Biome's suggestion) would make `roots` stale because `getPuck` is referentially stable.
	const roots = useMemo<readonly LayerNode[]>(() => {
		const data = getPuck().appState.data as Data;
		const zones = (data.zones ?? {}) as Readonly<Record<string, ComponentList>>;
		const childZonesByParent = indexZonesByParent(zones);
		const labelFor = (type: string): string => {
			const entry = components?.[type] as { label?: string } | undefined;
			return entry?.label ?? type;
		};
		return buildNodes(
			data.content ?? [],
			ROOT_ZONE,
			0,
			zones,
			childZonesByParent,
			labelFor,
		);
	}, [topology, components, getPuck]);

	return useMemo<LayerTreeModel>(
		() => ({
			roots,
			selectedId: typeof selectedId === "string" ? selectedId : null,
		}),
		[roots, selectedId],
	);
}

/**
 * One row in the **flattened, windowed** Layer-tree render path.
 *
 * For large documents the recursive `LayerZone` tree is replaced by a flat
 * list fed to `<Windowed>`, so DOM node count stays bounded no matter how
 * deep/wide the document is. A `"node"` row carries everything a `LayerRow`
 * needs (the node, plus the per-row `hasChildren`/`siblingCount` the nested
 * renderer derives inline); a `"zone-drop"` row is a droppable placeholder
 * for an **empty, expanded** child zone so cross-zone drops into it still
 * land (the nested renderer relies on the zone's own droppable container
 * for that, which a flat list has no equivalent of).
 */
export type LayerFlatRow =
	| {
			readonly type: "node";
			readonly key: string;
			readonly node: LayerNode;
			readonly hasChildren: boolean;
			/** Sibling count in `node.zone` — clamps keyboard reorder. */
			readonly siblingCount: number;
	  }
	| {
			readonly type: "zone-drop";
			readonly key: string;
			readonly zoneKey: string;
			readonly depth: number;
	  };

/**
 * Depth-first flatten of only the **visible** (expanded) rows, mirroring
 * exactly what the nested `LayerZone` tree renders for a given expansion
 * state. Collapsed subtrees are skipped; empty expanded zones emit a
 * `"zone-drop"` placeholder. `outlineExpanded[id] !== false` is the
 * default-expanded convention shared with `LayerRow`/`LayerZone`.
 */
export function flattenVisibleRows(
	roots: readonly LayerNode[],
	outlineExpanded: Readonly<Record<string, boolean>>,
): LayerFlatRow[] {
	const out: LayerFlatRow[] = [];
	const walk = (nodes: readonly LayerNode[]): void => {
		const siblingCount = nodes.length;
		for (const node of nodes) {
			const hasChildren = node.childZones.length > 0;
			out.push({ type: "node", key: node.id, node, hasChildren, siblingCount });
			if (!hasChildren || outlineExpanded[node.id] === false) continue;
			for (const childZone of node.childZones) {
				if (childZone.items.length === 0) {
					out.push({
						type: "zone-drop",
						key: `zone:${childZone.zoneKey}`,
						zoneKey: childZone.zoneKey,
						depth: node.depth + 1,
					});
				} else {
					walk(childZone.items);
				}
			}
		}
	};
	walk(roots);
	return out;
}

/** Depth-first list of `{id, zone, index}` for every node in the tree. */
export function flattenNodes(roots: readonly LayerNode[]): LayerNode[] {
	const out: LayerNode[] = [];
	const walk = (nodes: readonly LayerNode[]): void => {
		for (const node of nodes) {
			out.push(node);
			for (const zone of node.childZones) walk(zone.items);
		}
	};
	walk(roots);
	return out;
}

/** Find a node by component id anywhere in the tree. */
export function findNode(
	roots: readonly LayerNode[],
	id: string,
): LayerNode | null {
	return flattenNodes(roots).find((node) => node.id === id) ?? null;
}

/**
 * Build an `id → node` index for O(1) lookups (review finding P-2).
 * Callers memoize this on `roots` so repeated lookups during a drag /
 * a11y announcements don't each re-walk + allocate a flat node list.
 */
export function buildNodeIndex(
	roots: readonly LayerNode[],
): ReadonlyMap<string, LayerNode> {
	const index = new Map<string, LayerNode>();
	for (const node of flattenNodes(roots)) index.set(node.id, node);
	return index;
}

/**
 * Every zone key owned by `node` or any of its descendants. Used as the
 * cycle guard: a node may never be dropped into one of these zones.
 */
export function collectSubtreeZones(node: LayerNode): Set<string> {
	const zones = new Set<string>();
	const walk = (current: LayerNode): void => {
		for (const childZone of current.childZones) {
			zones.add(childZone.zoneKey);
			for (const item of childZone.items) walk(item);
		}
	};
	walk(node);
	return zones;
}

/**
 * Whether dropping into `destZone` would land inside the dragged node's own
 * subtree — the cycle that {@link resolveDrop} rejects. Factored out so the
 * "rejected because cycle" branch in `LayerTree` (the toast + screen-reader
 * announcement) and the resolver share one definition instead of each
 * re-deriving it from a bare `null` return.
 */
export function isCycleDrop(
	destZone: string,
	draggedSubtreeZones: ReadonlySet<string>,
): boolean {
	return draggedSubtreeZones.has(destZone);
}

/**
 * Pure resolver: map a (source, destination) pair to the Puck action
 * that performs the drop, or `null` to abort.
 *
 * - destination inside the dragged node's own subtree → `null` (cycle)
 * - no-op (same zone + same index) → `null`
 * - same zone → `reorder`
 * - different zone → `move`
 */
export function resolveDrop(args: {
	readonly source: DropEndpoint;
	readonly dest: DropEndpoint;
	readonly draggedSubtreeZones: ReadonlySet<string>;
}): PuckAction | null {
	const { source, dest, draggedSubtreeZones } = args;
	if (isCycleDrop(dest.zone, draggedSubtreeZones)) return null;
	if (source.zone === dest.zone) {
		if (source.index === dest.index) return null;
		return {
			type: "reorder",
			sourceIndex: source.index,
			destinationIndex: dest.index,
			destinationZone: dest.zone,
		};
	}
	return {
		type: "move",
		sourceIndex: source.index,
		sourceZone: source.zone,
		destinationIndex: dest.index,
		destinationZone: dest.zone,
	};
}
