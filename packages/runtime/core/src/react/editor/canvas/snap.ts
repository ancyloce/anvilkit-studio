"use client";

/**
 * @file The canvas snap engine (PLAN-0020 CORE-P1B-006;
 * ED-CANVAS-003; DD-0019 §13.5).
 *
 * Pure resolution over canvas-space rects:
 *
 * - **threshold**: 6 px in SCREEN space — zoom-independent, so the
 *   canvas-space window is `6 / zoom`;
 * - **priority** (§13.5): grid > sibling edge > parent edge > center >
 *   equal spacing; ties inside one tier resolve by smallest distance;
 * - exactly **one winning guide per axis**;
 * - **Alt disables** snapping entirely; **Shift locks** the drag to
 *   the dominant axis (the caller zeroes the other delta);
 * - at most **500 scanned elements** per calculation — beyond that the
 *   candidate set is truncated (deterministically, document order);
 * - spacing labels report the post-snap gaps to the nearest sibling
 *   or parent edge per axis for the §13.5 measurement readout.
 */

import type { CanvasRect } from "./geometry.js";

/** Screen-space snap threshold (§13.5). */
export const SNAP_THRESHOLD_PX = 6;
/** Scan cap per gesture calculation (§13.5 performance rule). */
export const SNAP_SCAN_LIMIT = 500;

/** Guide kinds in priority order (highest first). */
export const SNAP_PRIORITY = [
	"grid",
	"sibling-edge",
	"parent-edge",
	"center",
	"equal-spacing",
] as const;
export type SnapKind = (typeof SNAP_PRIORITY)[number];

/** One winning guide on one axis. */
export interface SnapGuide {
	readonly axis: "x" | "y";
	readonly kind: SnapKind;
	/** The guide line position (canvas space). */
	readonly position: number;
	/** How far the rect moved to snap (canvas px). */
	readonly delta: number;
}

/** A post-snap spacing measurement. */
export interface SpacingLabel {
	readonly axis: "x" | "y";
	/** Gap size (canvas px). */
	readonly gap: number;
	/** Midpoint of the gap for label placement. */
	readonly at: number;
}

/** Inputs for one resolution pass. */
export interface SnapInput {
	/** The proposed (pre-snap) rect of the moving/resizing node. */
	readonly moving: CanvasRect;
	readonly siblings: readonly CanvasRect[];
	readonly parent?: CanvasRect;
	/** Grid step (canvas px) when the container is a known grid. */
	readonly gridStep?: number;
	readonly zoom: number;
	/** Alt pressed: snapping disabled. */
	readonly disabled?: boolean;
}

/** The resolution result: at most one guide per axis. */
export interface SnapResult {
	readonly x: SnapGuide | null;
	readonly y: SnapGuide | null;
	readonly spacingLabels: readonly SpacingLabel[];
}

interface Candidate {
	readonly kind: SnapKind;
	readonly line: number;
	/** Which rect edge aligns to `line`: its current position. */
	readonly edge: number;
}

function edgesOf(rect: CanvasRect, axis: "x" | "y"): readonly number[] {
	return axis === "x"
		? [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
		: [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function axisCandidates(
	input: SnapInput,
	axis: "x" | "y",
): readonly Candidate[] {
	const moving = edgesOf(input.moving, axis);
	const [movingStart, movingCenter, movingEnd] = moving as [
		number,
		number,
		number,
	];
	const candidates: Candidate[] = [];
	const push = (kind: SnapKind, line: number, edge: number): void => {
		candidates.push({ kind, line, edge });
	};

	const siblings = input.siblings.slice(0, SNAP_SCAN_LIMIT);

	if (input.gridStep !== undefined && input.gridStep > 0) {
		// Nearest grid lines for the leading edge only (grid placement
		// aligns starts, matching CSS grid semantics).
		const step = input.gridStep;
		const nearest = Math.round(movingStart / step) * step;
		push("grid", nearest, movingStart);
	}

	for (const sibling of siblings) {
		const [start, center, end] = edgesOf(sibling, axis) as [
			number,
			number,
			number,
		];
		// Edge-to-edge alignment (start↔start, end↔end, start↔end).
		push("sibling-edge", start, movingStart);
		push("sibling-edge", end, movingEnd);
		push("sibling-edge", end, movingStart);
		push("sibling-edge", start, movingEnd);
		push("center", center, movingCenter);
	}

	if (input.parent !== undefined) {
		const [start, center, end] = edgesOf(input.parent, axis) as [
			number,
			number,
			number,
		];
		push("parent-edge", start, movingStart);
		push("parent-edge", end, movingEnd);
		push("center", center, movingCenter);
	}

	// Equal spacing: midpoint placement between the two nearest
	// siblings flanking the moving rect on this axis.
	const size = axis === "x" ? input.moving.width : input.moving.height;
	const before = siblings
		.map((rect) => edgesOf(rect, axis)[2] as number)
		.filter((end) => end <= movingStart)
		.sort((a, b) => b - a)[0];
	const after = siblings
		.map((rect) => edgesOf(rect, axis)[0] as number)
		.filter((start) => start >= movingEnd)
		.sort((a, b) => a - b)[0];
	if (before !== undefined && after !== undefined) {
		const equalStart = before + (after - before - size) / 2;
		push("equal-spacing", equalStart, movingStart);
	}

	return candidates;
}

function resolveAxis(input: SnapInput, axis: "x" | "y"): SnapGuide | null {
	const threshold = SNAP_THRESHOLD_PX / (input.zoom > 0 ? input.zoom : 1);
	let winner: { candidate: Candidate; distance: number } | null = null;
	for (const candidate of axisCandidates(input, axis)) {
		const distance = Math.abs(candidate.line - candidate.edge);
		if (distance > threshold) {
			continue;
		}
		if (winner === null) {
			winner = { candidate, distance };
			continue;
		}
		const currentPriority = SNAP_PRIORITY.indexOf(winner.candidate.kind);
		const nextPriority = SNAP_PRIORITY.indexOf(candidate.kind);
		if (
			nextPriority < currentPriority ||
			(nextPriority === currentPriority && distance < winner.distance)
		) {
			winner = { candidate, distance };
		}
	}
	if (winner === null) {
		return null;
	}
	return {
		axis,
		kind: winner.candidate.kind,
		position: winner.candidate.line,
		delta: winner.candidate.line - winner.candidate.edge,
	};
}

function spacingLabels(
	input: SnapInput,
	snapped: CanvasRect,
): readonly SpacingLabel[] {
	const labels: SpacingLabel[] = [];
	const siblings = input.siblings.slice(0, SNAP_SCAN_LIMIT);
	for (const axis of ["x", "y"] as const) {
		const [start, , end] = edgesOf(snapped, axis) as [number, number, number];
		const ends = siblings
			.map((rect) => edgesOf(rect, axis)[2] as number)
			.filter((value) => value <= start);
		const parentStart =
			input.parent === undefined
				? undefined
				: (edgesOf(input.parent, axis)[0] as number);
		const nearestBefore = [
			...ends,
			...(parentStart !== undefined ? [parentStart] : []),
		]
			.filter((value) => value <= start)
			.sort((a, b) => b - a)[0];
		if (nearestBefore !== undefined && start - nearestBefore > 0) {
			labels.push({
				axis,
				gap: start - nearestBefore,
				at: (start + nearestBefore) / 2,
			});
		}
		const starts = siblings
			.map((rect) => edgesOf(rect, axis)[0] as number)
			.filter((value) => value >= end);
		const parentEnd =
			input.parent === undefined
				? undefined
				: (edgesOf(input.parent, axis)[2] as number);
		const nearestAfter = [
			...starts,
			...(parentEnd !== undefined ? [parentEnd] : []),
		]
			.filter((value) => value >= end)
			.sort((a, b) => a - b)[0];
		if (nearestAfter !== undefined && nearestAfter - end > 0) {
			labels.push({
				axis,
				gap: nearestAfter - end,
				at: (end + nearestAfter) / 2,
			});
		}
	}
	return labels;
}

/** Resolve snapping for a proposed rect (one guide per axis). */
export function resolveSnap(input: SnapInput): SnapResult {
	if (input.disabled === true) {
		return { x: null, y: null, spacingLabels: [] };
	}
	const x = resolveAxis(input, "x");
	const y = resolveAxis(input, "y");
	const snapped: CanvasRect = {
		x: input.moving.x + (x?.delta ?? 0),
		y: input.moving.y + (y?.delta ?? 0),
		width: input.moving.width,
		height: input.moving.height,
	};
	return { x, y, spacingLabels: spacingLabels(input, snapped) };
}

/**
 * Shift axis lock (§13.5): zero the non-dominant delta component.
 */
export function lockAxis(delta: { readonly x: number; readonly y: number }): {
	readonly x: number;
	readonly y: number;
} {
	return Math.abs(delta.x) >= Math.abs(delta.y)
		? { x: delta.x, y: 0 }
		: { x: 0, y: delta.y };
}
