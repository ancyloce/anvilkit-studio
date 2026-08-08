"use client";

/**
 * @file Align + distribute over the multi-selection (PLAN-0028
 * `p4-006`; originally PLAN-0020 CORE-P1B-013).
 *
 * Pure geometry → appearance ops. No commands, no revision, no port:
 * the builders return {@link CanvasAppearanceOp}s and the toolbar hands
 * the whole list to `commitCanvasAppearance`, which folds them into ONE
 * history-recording dispatch. Aligning five nodes is therefore one undo,
 * exactly as the batch command it replaces was.
 *
 * Semantics (unchanged):
 * - **flow siblings sharing one parent prefer PARENT-layout changes**:
 *   align maps to the parent's `justifyContent` (main axis) or
 *   `alignItems` (cross axis) given its flex direction; distribute maps
 *   to an equalized parent `gap`. One parent op;
 * - **absolute nodes** align/distribute geometrically via per-node
 *   `inset` writes — cross-parent alignment is allowed ONLY here;
 * - mixed flow/absolute selections resolve the flow group through the
 *   parent and the absolute group geometrically, in the same intent.
 *
 * `inset` is a compound `CssBoxEdges` value, so each geometric op merges
 * onto the node's CURRENT authored inset ({@link AlignNode.inset},
 * read through the read model by the caller). Writing `{left}` alone
 * would erase an authored `top`.
 */

import type {
	CssAlignment,
	CssBoxEdges,
	CssJustification,
	CssLength,
} from "@anvilkit/contracts/editor";
import type { CanvasAppearanceOp } from "./appearance.js";
import type { CanvasRect } from "./geometry.js";

/** Alignment edges. */
export type AlignEdge =
	| "left"
	| "center"
	| "right"
	| "top"
	| "middle"
	| "bottom";

/** One selected node's geometry + layout mode. */
export interface AlignNode {
	readonly nodeId: string;
	readonly rect: CanvasRect;
	readonly position: "flow" | "absolute";
	/** Shared parent id for flow-group resolution (`null` = root). */
	readonly parentId: string | null;
	/** The parent's rect (absolute inset math). */
	readonly parentRect?: CanvasRect;
	/** The node's effective authored `inset`, so a write preserves edges. */
	readonly inset?: CssBoxEdges;
}

/** Inputs shared by both builders. */
export interface AlignInput {
	readonly nodes: readonly AlignNode[];
	/** The flow group's parent flex direction (when known). */
	readonly parentDirection?: "row" | "column";
	/** The flow group's parent node id. */
	readonly flowParentId?: string | null;
}

const NO_OPS: readonly CanvasAppearanceOp[] = Object.freeze([]);

const px = (value: number): CssLength => ({
	kind: "unit",
	value: Math.round(value),
	unit: "px",
});

function insetOp(node: AlignNode, edges: CssBoxEdges): CanvasAppearanceOp {
	return {
		nodeIds: [node.nodeId],
		patch: {
			kind: "set-property",
			property: "inset",
			value: { ...(node.inset ?? {}), ...edges },
		},
	};
}

function flowJustify(edge: AlignEdge): "start" | "center" | "end" {
	switch (edge) {
		case "left":
		case "top":
			return "start";
		case "center":
		case "middle":
			return "center";
		case "right":
		case "bottom":
			return "end";
	}
}

function isHorizontal(edge: AlignEdge): boolean {
	return edge === "left" || edge === "center" || edge === "right";
}

function absoluteInsetOp(
	node: AlignNode,
	edge: AlignEdge,
	bounds: CanvasRect,
): CanvasAppearanceOp {
	const parent = node.parentRect ?? { x: 0, y: 0, width: 0, height: 0 };
	if (isHorizontal(edge)) {
		const target =
			edge === "left"
				? bounds.x
				: edge === "center"
					? bounds.x + bounds.width / 2 - node.rect.width / 2
					: bounds.x + bounds.width - node.rect.width;
		return insetOp(node, { left: px(target - parent.x) });
	}
	const target =
		edge === "top"
			? bounds.y
			: edge === "middle"
				? bounds.y + bounds.height / 2 - node.rect.height / 2
				: bounds.y + bounds.height - node.rect.height;
	return insetOp(node, { top: px(target - parent.y) });
}

function boundsOf(nodes: readonly AlignNode[]): CanvasRect {
	const left = Math.min(...nodes.map((node) => node.rect.x));
	const top = Math.min(...nodes.map((node) => node.rect.y));
	const right = Math.max(...nodes.map((node) => node.rect.x + node.rect.width));
	const bottom = Math.max(
		...nodes.map((node) => node.rect.y + node.rect.height),
	);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Build the one-intent align ops (`[]` = nothing to do). */
export function buildAlignOps(
	edge: AlignEdge,
	input: AlignInput,
): readonly CanvasAppearanceOp[] {
	if (input.nodes.length < 2) {
		return NO_OPS;
	}
	const ops: CanvasAppearanceOp[] = [];
	const flow = input.nodes.filter((node) => node.position === "flow");
	const absolute = input.nodes.filter((node) => node.position === "absolute");

	// Flow group: one parent-layout op, and only when the group shares a
	// single parent (cross-parent flow alignment is undefined).
	if (flow.length >= 2) {
		const parents = new Set(flow.map((node) => node.parentId));
		if (parents.size === 1 && input.flowParentId != null) {
			const direction = input.parentDirection ?? "row";
			const mainAxis = (direction === "row") === isHorizontal(edge);
			const justify = flowJustify(edge);
			ops.push({
				nodeIds: [input.flowParentId],
				patch: mainAxis
					? {
							kind: "set-property",
							property: "justifyContent",
							value: justify satisfies CssJustification,
						}
					: {
							kind: "set-property",
							property: "alignItems",
							value: justify satisfies CssAlignment,
						},
			});
		}
	}

	// Absolute group: geometric per-node inset writes (cross-parent OK).
	if (absolute.length >= 2 || (absolute.length === 1 && flow.length >= 1)) {
		const bounds = boundsOf(input.nodes);
		for (const node of absolute) {
			ops.push(absoluteInsetOp(node, edge, bounds));
		}
	}

	return ops.length === 0 ? NO_OPS : ops;
}

/** Build the one-intent distribute ops (`[]` = nothing to do). */
export function buildDistributeOps(
	axis: "x" | "y",
	input: AlignInput,
): readonly CanvasAppearanceOp[] {
	if (input.nodes.length < 3) {
		return NO_OPS;
	}
	const flow = input.nodes.filter((node) => node.position === "flow");
	const absolute = input.nodes.filter((node) => node.position === "absolute");
	const ops: CanvasAppearanceOp[] = [];

	// Flow: equalize the shared parent's gap.
	if (flow.length >= 3) {
		const parents = new Set(flow.map((node) => node.parentId));
		if (parents.size === 1 && input.flowParentId != null) {
			const sorted = [...flow].sort((a, b) =>
				axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
			);
			const first = sorted[0] as AlignNode;
			const last = sorted[sorted.length - 1] as AlignNode;
			const span =
				axis === "x"
					? last.rect.x + last.rect.width - first.rect.x
					: last.rect.y + last.rect.height - first.rect.y;
			const content = sorted.reduce(
				(sum, node) =>
					sum + (axis === "x" ? node.rect.width : node.rect.height),
				0,
			);
			const gap = Math.max(
				0,
				(span - content) / Math.max(1, sorted.length - 1),
			);
			ops.push({
				nodeIds: [input.flowParentId],
				patch: { kind: "set-property", property: "gap", value: px(gap) },
			});
		}
	}

	// Absolute: even spacing between the first and last node.
	if (absolute.length >= 3) {
		const sorted = [...absolute].sort((a, b) =>
			axis === "x" ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
		);
		const first = sorted[0] as AlignNode;
		const last = sorted[sorted.length - 1] as AlignNode;
		const start = axis === "x" ? first.rect.x : first.rect.y;
		const end =
			axis === "x"
				? last.rect.x + last.rect.width
				: last.rect.y + last.rect.height;
		const content = sorted.reduce(
			(sum, node) => sum + (axis === "x" ? node.rect.width : node.rect.height),
			0,
		);
		const spacing = (end - start - content) / (sorted.length - 1);
		let cursor = start;
		for (const node of sorted) {
			const parent = node.parentRect ?? { x: 0, y: 0, width: 0, height: 0 };
			ops.push(
				insetOp(
					node,
					axis === "x"
						? { left: px(cursor - parent.x) }
						: { top: px(cursor - parent.y) },
				),
			);
			cursor += (axis === "x" ? node.rect.width : node.rect.height) + spacing;
		}
	}

	return ops.length === 0 ? NO_OPS : ops;
}
