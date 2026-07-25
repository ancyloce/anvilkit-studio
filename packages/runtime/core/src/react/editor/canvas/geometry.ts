"use client";

/**
 * @file `CanvasGeometryService` (PLAN-0020 CORE-P1B-002;
 * ED-CANVAS-005; DD-0019 §13.3).
 *
 * One coordinate model for every canvas surface. Two spaces:
 *
 * - **client** — parent-window client coordinates (where pointer
 *   events live);
 * - **canvas** — iframe-content CSS pixels, unscaled (where node
 *   rects and authoring values live).
 *
 * The canvas frame carries the `transform: scale(zoom)` in the parent
 * document, so the iframe's parent-space bounding rect is scaled
 * while rects measured INSIDE the iframe are not — the mapping is
 * `canvas = (client − frameOrigin) / zoom + iframeScroll` and its
 * inverse. DPR never enters CSS-pixel math; it only drives
 * device-pixel rounding for crisp guide/handle placement.
 *
 * DOMRect reads are batched: at most one `getBoundingClientRect` per
 * element per frame (WeakMap cache invalidated on the next animation
 * frame or an explicit `beginFrame()`), keeping gesture-frame costs
 * flat under the §28 budget.
 */

/** A point in either space. */
export interface CanvasPoint {
	readonly x: number;
	readonly y: number;
}

/** A canvas-space rectangle (CSS px, unscaled, content coords). */
export interface CanvasRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/** Dependencies — thunks so tests need no real iframe. */
export interface CanvasGeometryDeps {
	/** The iframe's parent-space bounding rect (scaled), or `null`. */
	readonly getIframeBoundingRect: () => Pick<DOMRect, "left" | "top"> | null;
	/** The iframe window's scroll offsets (content CSS px). */
	readonly getIframeScroll: () => CanvasPoint;
	/** The live canvas zoom (1 = 100%). */
	readonly getZoom: () => number;
	/** The device pixel ratio (crisp-rounding only). */
	readonly getDpr: () => number;
}

/** The §13.3 geometry surface. */
export interface CanvasGeometryService {
	/** Parent-window client point → canvas content point. */
	clientToCanvas(point: CanvasPoint): CanvasPoint | null;
	/** Canvas content point → parent-window client point. */
	canvasToClient(point: CanvasPoint): CanvasPoint | null;
	/** A canvas-space rect for an element inside the iframe (batched). */
	getNodeRect(element: Element): CanvasRect;
	/** Round a CSS-px value to the device-pixel grid. */
	snapToDevicePixels(value: number): number;
	/** Drop the per-frame DOMRect cache explicitly (tests, gestures). */
	beginFrame(): void;
}

/** Create the geometry service over injected live thunks. */
export function createCanvasGeometryService(
	deps: CanvasGeometryDeps,
): CanvasGeometryService {
	let rectCache = new WeakMap<Element, CanvasRect>();
	let frameScheduled = false;

	const scheduleInvalidate = (): void => {
		if (frameScheduled) {
			return;
		}
		frameScheduled = true;
		const raf =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: () => void) => setTimeout(callback, 16);
		raf(() => {
			frameScheduled = false;
			rectCache = new WeakMap();
		});
	};

	const zoom = (): number => {
		const value = deps.getZoom();
		return value > 0 ? value : 1;
	};

	return {
		clientToCanvas(point) {
			const frame = deps.getIframeBoundingRect();
			if (frame === null) {
				return null;
			}
			const scroll = deps.getIframeScroll();
			const scale = zoom();
			return {
				x: (point.x - frame.left) / scale + scroll.x,
				y: (point.y - frame.top) / scale + scroll.y,
			};
		},

		canvasToClient(point) {
			const frame = deps.getIframeBoundingRect();
			if (frame === null) {
				return null;
			}
			const scroll = deps.getIframeScroll();
			const scale = zoom();
			return {
				x: (point.x - scroll.x) * scale + frame.left,
				y: (point.y - scroll.y) * scale + frame.top,
			};
		},

		getNodeRect(element) {
			const cached = rectCache.get(element);
			if (cached !== undefined) {
				return cached;
			}
			// Rects measured inside the iframe are viewport-relative and
			// unscaled; content coordinates add the iframe scroll.
			const rect = element.getBoundingClientRect();
			const scroll = deps.getIframeScroll();
			const canvasRect: CanvasRect = {
				x: rect.left + scroll.x,
				y: rect.top + scroll.y,
				width: rect.width,
				height: rect.height,
			};
			rectCache.set(element, canvasRect);
			scheduleInvalidate();
			return canvasRect;
		},

		snapToDevicePixels(value) {
			const dpr = deps.getDpr() > 0 ? deps.getDpr() : 1;
			return Math.round(value * dpr) / dpr;
		},

		beginFrame() {
			rectCache = new WeakMap();
		},
	};
}
