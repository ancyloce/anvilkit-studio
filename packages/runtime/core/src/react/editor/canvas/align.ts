"use client";

/**
 * @file Align + distribute over the multi-selection (PLAN-0020
 * CORE-P1B-013, re-phased from Phase 2; ED-CANVAS-006; DD-0019
 * §13.6).
 *
 * Semantics:
 * - **flow siblings sharing one parent prefer PARENT-layout
 *   changes**: align maps to the parent's `justifyContent` (main
 *   axis) or `alignItems` (cross axis) given its flex direction;
 *   distribute maps to an equalized parent `gap`. One parent patch =
 *   one command;
 * - **absolute nodes** align/distribute geometrically via per-node
 *   `inset` writes — cross-parent alignment is allowed ONLY here;
 * - every operation is ONE intent: a single command or one atomic
 *   batch (freeze §5);
 * - mixed flow/absolute selections resolve the flow group through the
 *   parent and the absolute group geometrically, in the same batch.
 *
 * The multi-select duplicate/delete/lock/hide bulk ops on canvas
 * reuse the CORE-P1A-017 command set verbatim (same keymap, canvas
 * selection); create-component-from-multi-select stays in Phase 2.
 */

import type {
	CssLength,
} from "@anvilkit/contracts/editor";
import type {
	AtomicEditorCommand,
	EditorCommand,
} from "../../../editor/legacy/index.js";
import type { CanvasRect } from "./geometry.js";

/** Alignment edges (§13.6). */
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
}

/** Inputs shared by both builders. */
export interface AlignInput {
	readonly nodes: readonly AlignNode[];
	readonly revision: number;
	/** The flow group's parent flex direction (when known). */
	readonly parentDirection?: "row" | "column";
	/** The flow group's parent node id. */
	readonly flowParentId?: string | null;
}

const px = (value: number): CssLength => ({
	kind: "unit",
	value: Math.round(value),
	unit: "px",
});

let alignSeq = 0;
function base(revision: number) {
	alignSeq += 1;
	return {
		id: `align-${alignSeq}-${crypto.randomUUID().slice(0, 8)}`,
		expectedRevision: revision,
		source: "canvas" as const,
		timestamp: Date.now(),
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

function absoluteInsetPatch(
	node: AlignNode,
	edge: AlignEdge,
	bounds: CanvasRect,
): AtomicEditorCommand | null {
	const parent = node.parentRect ?? { x: 0, y: 0, width: 0, height: 0 };
	if (isHorizontal(edge)) {
		const target =
			edge === "left"
				? bounds.x
				: edge === "center"
					? bounds.x + bounds.width / 2 - node.rect.width / 2
					: bounds.x + bounds.width - node.rect.width;
		return {
			id: "",
			expectedRevision: 0,
			source: "canvas",
			timestamp: 0,
			type: "node.layout.set",
			nodeIds: [node.nodeId],
			breakpointId: "base",
			patch: { inset: { left: px(target - parent.x) } },
		};
	}
	const target =
		edge === "top"
			? bounds.y
			: edge === "middle"
				? bounds.y + bounds.height / 2 - node.rect.height / 2
				: bounds.y + bounds.height - node.rect.height;
	return {
		id: "",
		expectedRevision: 0,
		source: "canvas",
		timestamp: 0,
		type: "node.layout.set",
		nodeIds: [node.nodeId],
		breakpointId: "base",
		patch: { inset: { top: px(target - parent.y) } },
	};
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

/** Build the one-intent align command (`null` = nothing to do). */
export function buildAlignCommand(
	edge: AlignEdge,
	input: AlignInput,
): EditorCommand | null {
	if (input.nodes.length < 2) {
		return null;
	}
	const commands: AtomicEditorCommand[] = [];
	const flow = input.nodes.filter((node) => node.position === "flow");
	const absolute = input.nodes.filter((node) => node.position === "absolute");

	// Flow group: one parent-layout patch, and only when the group
	// shares a single parent (cross-parent flow alignment is undefined
	// — §13.6).
	if (flow.length >= 2) {
		const parents = new Set(flow.map((node) => node.parentId));
		if (parents.size === 1 && input.flowParentId != null) {
			const direction = input.parentDirection ?? "row";
			const mainAxis = (direction === "row") === isHorizontal(edge);
			commands.push({
				id: "",
				expectedRevision: 0,
				source: "canvas",
				timestamp: 0,
				type: "node.layout.set",
				nodeIds: [input.flowParentId],
				breakpointId: "base",
				patch: mainAxis
					? { justifyContent: flowJustify(edge) }
					: {
							alignItems:
								flowJustify(edge) === "start"
									? "start"
									: flowJustify(edge) === "center"
										? "center"
										: "end",
						},
			});
		}
	}

	// Absolute group: geometric per-node inset writes (cross-parent OK).
	if (absolute.length >= 2 || (absolute.length === 1 && flow.length >= 1)) {
		const bounds = boundsOf(input.nodes);
		for (const node of absolute) {
			const patch = absoluteInsetPatch(node, edge, bounds);
			if (patch !== null) {
				commands.push(patch);
			}
		}
	}

	if (commands.length === 0) {
		return null;
	}
	if (commands.length === 1 && commands[0] !== undefined) {
		return { ...commands[0], ...base(input.revision) };
	}
	return {
		...base(input.revision),
		type: "batch",
		label: `align-${edge}`,
		commands: commands.map((command, index) => ({
			...command,
			id: `align-member-${index}`,
		})),
	};
}

/** Build the one-intent distribute command (`null` = nothing). */
export function buildDistributeCommand(
	axis: "x" | "y",
	input: AlignInput,
): EditorCommand | null {
	if (input.nodes.length < 3) {
		return null;
	}
	const flow = input.nodes.filter((node) => node.position === "flow");
	const absolute = input.nodes.filter((node) => node.position === "absolute");
	const commands: AtomicEditorCommand[] = [];

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
			commands.push({
				id: "",
				expectedRevision: 0,
				source: "canvas",
				timestamp: 0,
				type: "node.layout.set",
				nodeIds: [input.flowParentId],
				breakpointId: "base",
				patch: { gap: px(gap) },
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
			commands.push({
				id: "",
				expectedRevision: 0,
				source: "canvas",
				timestamp: 0,
				type: "node.layout.set",
				nodeIds: [node.nodeId],
				breakpointId: "base",
				patch:
					axis === "x"
						? { inset: { left: px(cursor - parent.x) } }
						: { inset: { top: px(cursor - parent.y) } },
			});
			cursor += (axis === "x" ? node.rect.width : node.rect.height) + spacing;
		}
	}

	if (commands.length === 0) {
		return null;
	}
	if (commands.length === 1 && commands[0] !== undefined) {
		return { ...commands[0], ...base(input.revision) };
	}
	return {
		...base(input.revision),
		type: "batch",
		label: `distribute-${axis}`,
		commands: commands.map((command, index) => ({
			...command,
			id: `distribute-member-${index}`,
		})),
	};
}
