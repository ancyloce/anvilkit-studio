/**
 * @file Regression test for review finding M3: `useAutoHeight()`'s
 * ResizeObserver schedules a `requestAnimationFrame`; the pending
 * frame must be cancelled on unmount (and coalesced between bursts)
 * so `setHeight` can never fire after the component is gone.
 */

import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoHeight } from "@/primitives/hooks/use-auto-height";

let observerCb: (() => void) | null = null;

class MockResizeObserver {
	constructor(cb: () => void) {
		observerCb = cb;
	}
	observe(): void {
		/* no-op: callback is driven manually via `observerCb` */
	}
	unobserve(): void {
		/* no-op */
	}
	disconnect(): void {
		/* no-op */
	}
}

let rafId = 0;
let pendingRaf: { id: number; cb: FrameRequestCallback } | null = null;
const rafSpy = vi.fn((cb: FrameRequestCallback): number => {
	rafId += 1;
	pendingRaf = { id: rafId, cb };
	return rafId;
});
const cafSpy = vi.fn((id: number): void => {
	if (pendingRaf?.id === id) pendingRaf = null;
});

beforeEach(() => {
	observerCb = null;
	rafId = 0;
	pendingRaf = null;
	rafSpy.mockClear();
	cafSpy.mockClear();
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
	vi.stubGlobal("requestAnimationFrame", rafSpy);
	vi.stubGlobal("cancelAnimationFrame", cafSpy);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function Probe(): ReactElement {
	const { ref, height } = useAutoHeight();
	return (
		<div ref={ref} data-testid="box">
			{height}
		</div>
	);
}

describe("useAutoHeight", () => {
	it("cancels the pending RAF on unmount so setHeight cannot fire late", () => {
		const { unmount } = render(<Probe />);
		expect(observerCb).not.toBeNull();

		// Simulate a resize → schedules a frame.
		observerCb?.();
		expect(rafSpy).toHaveBeenCalledTimes(1);
		const scheduledId = pendingRaf?.id;
		expect(scheduledId).toBeDefined();

		unmount();
		expect(cafSpy).toHaveBeenCalledWith(scheduledId);
		expect(pendingRaf).toBeNull();
	});

	it("coalesces a burst of resize callbacks into a single pending frame", () => {
		render(<Probe />);
		observerCb?.();
		const firstId = rafId;
		observerCb?.();
		observerCb?.();
		// Each new schedule cancels the previously pending frame.
		expect(cafSpy).toHaveBeenCalledWith(firstId);
		expect(pendingRaf?.id).toBe(rafId);
	});
});
