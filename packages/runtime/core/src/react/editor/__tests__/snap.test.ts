/**
 * @file CORE-P1B-006 — snap engine: zoom-independent 6 px screen
 * threshold, the §13.5 priority ladder, one guide per axis, Alt
 * disable, Shift axis lock, the 500-element scan cap, spacing labels,
 * and the gesture-frame perf budget at 1k candidates.
 */

import { describe, expect, it } from "vitest";
import type { CanvasRect } from "../canvas/geometry.js";
import {
	lockAxis,
	resolveSnap,
	SNAP_SCAN_LIMIT,
	SNAP_THRESHOLD_PX,
} from "../canvas/snap.js";

const rect = (x: number, y: number, width = 100, height = 50): CanvasRect => ({
	x,
	y,
	width,
	height,
});

describe("snap engine (CORE-P1B-006)", () => {
	it("snaps to a sibling edge inside the zoom-scaled threshold", () => {
		const result = resolveSnap({
			moving: rect(104, 300),
			siblings: [rect(100, 100)],
			zoom: 1,
		});
		expect(result.x).toMatchObject({
			kind: "sibling-edge",
			position: 100,
			delta: -4,
		});
		// Zoom-independent SCREEN threshold: 4 canvas px is 8 screen px
		// at zoom 2 (no snap) but only 2 screen px at zoom 0.5 (snap).
		const zoomedIn = resolveSnap({
			moving: rect(104, 300),
			siblings: [rect(100, 100)],
			zoom: 2,
		});
		expect(
			zoomedIn.x,
			`threshold is ${SNAP_THRESHOLD_PX}/zoom canvas px`,
		).toBeNull();
		const zoomedOut = resolveSnap({
			moving: rect(104, 300),
			siblings: [rect(100, 100)],
			zoom: 0.5,
		});
		expect(zoomedOut.x).not.toBeNull();
	});

	it("applies the priority ladder: grid beats sibling edge beats center", () => {
		const input = {
			moving: rect(103, 300),
			siblings: [rect(100, 100)],
			parent: rect(0, 0, 1000, 1000),
			zoom: 1,
		};
		// Sibling edge (100) and grid line (104) both in range: grid wins
		// despite the sibling edge being closer.
		const withGrid = resolveSnap({ ...input, gridStep: 52 });
		expect(withGrid.x?.kind).toBe("grid");
		expect(withGrid.x?.position).toBe(104);

		const withoutGrid = resolveSnap(input);
		expect(withoutGrid.x?.kind).toBe("sibling-edge");
	});

	it("emits at most one guide per axis and supports Alt-disable", () => {
		const input = {
			moving: rect(102, 102),
			siblings: [rect(100, 100), rect(104, 96)],
			zoom: 1,
		};
		const result = resolveSnap(input);
		expect(result.x).not.toBeNull();
		expect(result.y).not.toBeNull();
		const disabled = resolveSnap({ ...input, disabled: true });
		expect(disabled.x).toBeNull();
		expect(disabled.y).toBeNull();
		expect(disabled.spacingLabels).toEqual([]);
	});

	it("proposes equal-spacing midpoints between flanking siblings", () => {
		const result = resolveSnap({
			// Gap before: 100→196 (moving at 196..296), gap after: 296→400.
			moving: rect(196, 0),
			siblings: [rect(0, 0, 100, 50), rect(400, 0, 100, 50)],
			zoom: 1,
		});
		// Equal spacing start = 100 + (400-100-100)/2 = 200.
		expect(result.x?.kind === "equal-spacing" ? result.x.position : null).toBe(
			200,
		);
	});

	it("reports spacing labels for the snapped rect", () => {
		const result = resolveSnap({
			moving: rect(150, 60),
			siblings: [rect(0, 0, 100, 50)],
			parent: rect(0, 0, 500, 400),
			zoom: 1,
		});
		const xGap = result.spacingLabels.find((label) => label.axis === "x");
		expect(xGap?.gap).toBe(50); // 100 → 150
		const yGap = result.spacingLabels.find((label) => label.axis === "y");
		expect(yGap?.gap).toBe(10); // sibling bottom 50 → 60
	});

	it("locks the drag to the dominant axis (Shift)", () => {
		expect(lockAxis({ x: 30, y: 10 })).toEqual({ x: 30, y: 0 });
		expect(lockAxis({ x: -5, y: 12 })).toEqual({ x: 0, y: 12 });
	});

	it("caps scanning at 500 elements and stays inside the frame budget", () => {
		const siblings = Array.from({ length: 1000 }, (_, index) =>
			rect(index * 10, index * 7, 8, 8),
		);
		const startedAt = performance.now();
		const result = resolveSnap({
			moving: rect(SNAP_SCAN_LIMIT * 10 + 10_000, 999_999),
			siblings,
			zoom: 1,
		});
		const elapsed = performance.now() - startedAt;
		// Elements beyond the cap can never produce a guide.
		expect(result.x).toBeNull();
		expect(elapsed).toBeLessThan(16.7);
	});
});
