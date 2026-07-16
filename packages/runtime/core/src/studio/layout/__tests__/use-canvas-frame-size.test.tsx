/**
 * @file `useCanvasFrameSize` reads the pre-transform content box via
 * `ResizeObserver`, not `getBoundingClientRect()` — this is what lets
 * the Phase 4 zoom stage compute `naturalSize * zoom` without
 * double-applying the scale factor already painted onto the observed
 * element via `transform: scale()`.
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasFrameSize } from "@/layout/use-canvas-frame-size";

let observerCb: ResizeObserverCallback | null = null;
let observedEl: Element | null = null;

class MockResizeObserver {
	constructor(cb: ResizeObserverCallback) {
		observerCb = cb;
	}
	observe(el: Element): void {
		observedEl = el;
	}
	unobserve(): void {
		/* no-op */
	}
	disconnect(): void {
		/* no-op */
	}
}

beforeEach(() => {
	observerCb = null;
	observedEl = null;
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function fire(width: number, height: number): void {
	if (observerCb === null || observedEl === null) return;
	const entry = {
		target: observedEl,
		contentRect: {
			width,
			height,
			top: 0,
			left: 0,
			right: width,
			bottom: height,
			x: 0,
			y: 0,
		},
		contentBoxSize: [{ inlineSize: width, blockSize: height }],
		borderBoxSize: [{ inlineSize: width, blockSize: height }],
		devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
	} as unknown as ResizeObserverEntry;
	// Pass a stub (not `new MockResizeObserver(...)`) for the callback's
	// 2nd (observer) argument — constructing a real one would reassign
	// the shared `observerCb` as a side effect, clobbering the observer
	// this call is meant to invoke.
	act(() => observerCb?.([entry], {} as ResizeObserver));
}

function Probe(): ReactElement {
	const { ref, size } = useCanvasFrameSize<HTMLDivElement>();
	return (
		<div ref={ref} data-testid="probe">
			{size.width}x{size.height}
		</div>
	);
}

describe("useCanvasFrameSize", () => {
	it("starts at 0x0 before any ResizeObserver callback fires", () => {
		const { getByTestId } = render(<Probe />);
		expect(getByTestId("probe").textContent).toBe("0x0");
	});

	it("reports the observed contentBoxSize, independent of any transform on the element", () => {
		const { getByTestId } = render(<Probe />);
		fire(1280, 900);
		expect(getByTestId("probe").textContent).toBe("1280x900");
	});

	it("updates on subsequent resize callbacks", () => {
		const { getByTestId } = render(<Probe />);
		fire(1280, 900);
		fire(768, 1400);
		expect(getByTestId("probe").textContent).toBe("768x1400");
	});

	it("disconnects the observer on unmount", () => {
		const disconnectSpy = vi.fn();
		class SpyResizeObserver extends MockResizeObserver {
			override disconnect(): void {
				disconnectSpy();
			}
		}
		vi.stubGlobal("ResizeObserver", SpyResizeObserver);
		const { unmount } = render(<Probe />);
		unmount();
		expect(disconnectSpy).toHaveBeenCalledTimes(1);
	});
});
