/**
 * @file Pure-math tests for `computeActionBarPosition()` — clamping
 * + zoom independence (Phase 3 acceptance).
 */

import { describe, expect, it } from "vitest";

import {
	clampRectIntoViewport,
	computeActionBarPosition,
} from "@/overrides/utils/action-bar-position";

const VIEWPORT = { x: 0, y: 0, width: 1000, height: 600 };
const BAR = { width: 80, height: 24 };

describe("computeActionBarPosition", () => {
	it("anchors to top-right of target at 1x zoom", () => {
		const result = computeActionBarPosition({
			target: { x: 200, y: 100, width: 300, height: 80 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 1,
		});
		// desiredX = 200 + 300 - 80 = 420, desiredY = 100 - (24+4) = 72
		expect(result.x).toBe(420);
		expect(result.y).toBe(72);
	});

	it("clamps to viewport when target overflows the right edge", () => {
		const result = computeActionBarPosition({
			target: { x: 980, y: 50, width: 200, height: 40 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 1,
			margin: 4,
		});
		// maxX = 1000 - 80 - 4 = 916
		expect(result.x).toBe(916);
	});

	it("clamps to viewport when target overflows the top edge", () => {
		const result = computeActionBarPosition({
			target: { x: 50, y: 0, width: 100, height: 30 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 1,
			margin: 4,
		});
		// minY = 0 + 4 = 4
		expect(result.y).toBe(4);
	});

	it("scales offsets inversely with zoom so on-screen size is constant", () => {
		const at1x = computeActionBarPosition({
			target: { x: 200, y: 100, width: 300, height: 80 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 1,
		});
		const at2x = computeActionBarPosition({
			target: { x: 200, y: 100, width: 300, height: 80 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 2,
		});
		// At 2x zoom, offsets shrink by half so the bar still hugs the
		// component visually. desiredX(2x) = 200 + 300 - 80/2 = 460
		expect(at2x.x).toBe(460);
		expect(at2x.x).not.toBe(at1x.x);
	});

	it("treats zoom=0 as 1x to avoid division by zero", () => {
		const result = computeActionBarPosition({
			target: { x: 100, y: 100, width: 200, height: 50 },
			viewport: VIEWPORT,
			bar: BAR,
			zoom: 0,
		});
		expect(Number.isFinite(result.x)).toBe(true);
		expect(Number.isFinite(result.y)).toBe(true);
	});
});

describe("clampRectIntoViewport", () => {
	it("returns a no-op correction when the rect already fits", () => {
		const result = clampRectIntoViewport(
			{ x: 100, y: 100, width: 80, height: 24 },
			VIEWPORT,
		);
		expect(result).toEqual({ dx: 0, dy: 0 });
	});

	it("nudges left when the rect overflows the right edge", () => {
		const result = clampRectIntoViewport(
			{ x: 960, y: 100, width: 80, height: 24 },
			VIEWPORT,
			4,
		);
		// maxX = 1000 - 80 - 4 = 916; rect.x = 960 → dx = 916 - 960 = -44
		expect(result.dx).toBe(-44);
		expect(result.dy).toBe(0);
	});

	it("nudges down when the rect overflows the top edge", () => {
		const result = clampRectIntoViewport(
			{ x: 100, y: -10, width: 80, height: 24 },
			VIEWPORT,
			4,
		);
		expect(result.dx).toBe(0);
		expect(result.dy).toBe(14);
	});

	it("nudges on both axes when the rect overflows a corner", () => {
		const result = clampRectIntoViewport(
			{ x: 990, y: 590, width: 80, height: 24 },
			VIEWPORT,
			4,
		);
		expect(result.dx).toBeLessThan(0);
		expect(result.dy).toBeLessThan(0);
	});

	it("prefers the min bound (never returns a negative-size clamp range) when the rect is larger than the viewport", () => {
		const result = clampRectIntoViewport(
			{ x: 0, y: 0, width: 2000, height: 24 },
			VIEWPORT,
			4,
		);
		expect(Number.isFinite(result.dx)).toBe(true);
	});
});
