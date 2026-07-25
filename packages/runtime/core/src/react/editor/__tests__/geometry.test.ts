/**
 * @file CORE-P1B-002 — `CanvasGeometryService`: the §27.5
 * jsdom-computable matrix (zoom 25–400% × DPR 1/1.25/2 × scroll
 * combinations), round-trip inversion, batched DOMRect reads (one per
 * element per frame), and device-pixel rounding. Browser-only rows
 * (real transforms, touch drivers) belong to CORE-P1B-012.
 */

import { describe, expect, it, vi } from "vitest";
import {
	type CanvasGeometryDeps,
	createCanvasGeometryService,
} from "../canvas/geometry.js";

const ZOOMS = [0.25, 0.5, 0.8, 1, 1.5, 2, 4] as const;
const DPRS = [1, 1.25, 2] as const;
const SCROLLS = [
	{ x: 0, y: 0 },
	{ x: 120, y: 340 },
	{ x: 7, y: 1999 },
] as const;

function service(overrides?: Partial<CanvasGeometryDeps>) {
	const state = {
		frame: { left: 200, top: 80 },
		scroll: { x: 0, y: 0 },
		zoom: 1,
		dpr: 1,
	};
	const geometry = createCanvasGeometryService({
		getIframeBoundingRect: () => state.frame,
		getIframeScroll: () => state.scroll,
		getZoom: () => state.zoom,
		getDpr: () => state.dpr,
		...overrides,
	});
	return { geometry, state };
}

describe("CanvasGeometryService (CORE-P1B-002)", () => {
	it("maps client↔canvas across the zoom × DPR × scroll matrix", () => {
		const { geometry, state } = service();
		for (const zoom of ZOOMS) {
			for (const dpr of DPRS) {
				for (const scroll of SCROLLS) {
					state.zoom = zoom;
					state.dpr = dpr;
					state.scroll = scroll;
					const client = { x: 431.5, y: 267.25 };
					const canvas = geometry.clientToCanvas(client);
					expect(canvas).not.toBeNull();
					if (canvas === null) continue;
					// Forward mapping definition.
					expect(canvas.x).toBeCloseTo((client.x - 200) / zoom + scroll.x, 10);
					expect(canvas.y).toBeCloseTo((client.y - 80) / zoom + scroll.y, 10);
					// Round-trip inversion.
					const back = geometry.canvasToClient(canvas);
					expect(back?.x).toBeCloseTo(client.x, 8);
					expect(back?.y).toBeCloseTo(client.y, 8);
				}
			}
		}
	});

	it("returns null when the iframe is unmounted", () => {
		const { geometry } = service({ getIframeBoundingRect: () => null });
		expect(geometry.clientToCanvas({ x: 0, y: 0 })).toBeNull();
		expect(geometry.canvasToClient({ x: 0, y: 0 })).toBeNull();
	});

	it("tolerates a zero/negative zoom (treated as 100%)", () => {
		const { geometry, state } = service();
		state.zoom = 0;
		expect(geometry.clientToCanvas({ x: 210, y: 90 })).toEqual({
			x: 10,
			y: 10,
		});
	});

	it("adds iframe scroll to in-iframe rect reads", () => {
		const { geometry, state } = service();
		state.scroll = { x: 50, y: 500 };
		const element = document.createElement("div");
		element.getBoundingClientRect = () =>
			({ left: 10, top: 20, width: 300, height: 40 }) as DOMRect;
		expect(geometry.getNodeRect(element)).toEqual({
			x: 60,
			y: 520,
			width: 300,
			height: 40,
		});
	});

	it("reads each element's DOMRect at most once per frame (batching)", () => {
		const { geometry } = service();
		const element = document.createElement("div");
		const read = vi.fn(
			() => ({ left: 1, top: 2, width: 3, height: 4 }) as DOMRect,
		);
		element.getBoundingClientRect = read;
		geometry.getNodeRect(element);
		geometry.getNodeRect(element);
		geometry.getNodeRect(element);
		expect(read).toHaveBeenCalledTimes(1);
		// Explicit frame boundary invalidates the cache.
		geometry.beginFrame();
		geometry.getNodeRect(element);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("rounds to the device-pixel grid per DPR", () => {
		const { geometry, state } = service();
		state.dpr = 2;
		expect(geometry.snapToDevicePixels(10.26)).toBeCloseTo(10.5, 10);
		state.dpr = 1;
		expect(geometry.snapToDevicePixels(10.26)).toBe(10);
		state.dpr = 1.25;
		expect(geometry.snapToDevicePixels(10.3)).toBeCloseTo(10.4, 10);
	});
});
