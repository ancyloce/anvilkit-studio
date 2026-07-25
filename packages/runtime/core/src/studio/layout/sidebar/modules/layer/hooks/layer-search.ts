/**
 * @file Layer search + locked-subtree derivation (PLAN-0020
 * CORE-P1A-010/-011; ED-LAYER-001/-003; §18 search).
 *
 * Pure helpers over the `LayerNode` tree:
 *
 * - {@link filterLayerTree} prunes the tree to nodes matching a query
 *   by display name / component type / id, **retaining ancestor
 *   context** — every ancestor of a match stays visible so the tree
 *   shape around a hit remains readable (§18).
 * - {@link collectLockedSubtree} expands the locked node set to every
 *   descendant, so locked-ancestor mutation fencing (drag, reorder,
 *   destructive ops) can gate rows in O(1).
 *
 * Both are single-pass and allocation-light — the 10k-row
 * interactivity budget (search ≤200 ms, CORE-P1A-011) is asserted by
 * the benchmark test in `__tests__/layer-search.test.ts`.
 */

import type { LayerNode } from "./use-layer-tree";

/** Case-insensitive match over name, type, and id (§18). */
function matches(
	node: LayerNode,
	query: string,
	nameOf: ((nodeId: string, fallback: string) => string) | undefined,
): boolean {
	const name = nameOf?.(node.id, node.label) ?? node.label;
	return (
		name.toLowerCase().includes(query) ||
		node.type.toLowerCase().includes(query) ||
		node.id.toLowerCase().includes(query)
	);
}

/**
 * Prune a layer tree to `query` matches plus their ancestors. Returns
 * the input array by reference for a blank query (no re-render churn).
 */
export function filterLayerTree(
	roots: readonly LayerNode[],
	query: string,
	nameOf?: (nodeId: string, fallback: string) => string,
): readonly LayerNode[] {
	const trimmed = query.trim().toLowerCase();
	if (trimmed === "") {
		return roots;
	}
	const prune = (nodes: readonly LayerNode[]): LayerNode[] => {
		const kept: LayerNode[] = [];
		for (const node of nodes) {
			const prunedZones = node.childZones
				.map((zone) => ({ ...zone, items: prune(zone.items) }))
				.filter((zone) => zone.items.length > 0);
			if (matches(node, trimmed, nameOf)) {
				// A direct match keeps its full subtree visible (context
				// below the hit), not just matching descendants.
				kept.push(node);
			} else if (prunedZones.length > 0) {
				// Ancestor of a match: keep, showing only matching branches.
				kept.push({ ...node, childZones: prunedZones });
			}
		}
		return kept;
	};
	return prune(roots);
}

/**
 * Expand locked node ids to their full subtrees (locked-ancestor
 * fencing, ED-LAYER-001/§18): a descendant of a locked node cannot be
 * dragged, reordered, or destructively mutated.
 */
export function collectLockedSubtree(
	roots: readonly LayerNode[],
	isLocked: (nodeId: string) => boolean,
): ReadonlySet<string> {
	const fenced = new Set<string>();
	const walk = (nodes: readonly LayerNode[], underLock: boolean): void => {
		for (const node of nodes) {
			const locked = underLock || isLocked(node.id);
			if (locked) {
				fenced.add(node.id);
			}
			for (const zone of node.childZones) {
				walk(zone.items, locked);
			}
		}
	};
	walk(roots, false);
	return fenced;
}
