/**
 * @file Tests for `<ActionBar>`'s viewport-edge correction (task
 * Phase 8). `getBoundingClientRect` is stubbed since Puck's own
 * positioning (a wrapper this override doesn't control) has no real
 * effect under jsdom's layout-free environment — the stub simulates
 * "Puck placed the bar overflowing the viewport" so the corrective
 * `transform` this override applies can be asserted directly.
 */

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionBar } from "@/overrides/canvas/ActionBar";

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 600;

let mockRect: { x: number; y: number; width: number; height: number };

beforeEach(() => {
	vi.stubGlobal("innerWidth", VIEWPORT_WIDTH);
	vi.stubGlobal("innerHeight", VIEWPORT_HEIGHT);
	mockRect = { x: 0, y: 0, width: 80, height: 24 };
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		() =>
			({
				x: mockRect.x,
				y: mockRect.y,
				left: mockRect.x,
				top: mockRect.y,
				right: mockRect.x + mockRect.width,
				bottom: mockRect.y + mockRect.height,
				width: mockRect.width,
				height: mockRect.height,
				toJSON() {
					return this;
				},
			}) as DOMRect,
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("ActionBar viewport-edge correction", () => {
	it("applies no transform when Puck already placed the bar in bounds", () => {
		mockRect = { x: 100, y: 100, width: 80, height: 24 };
		const { container } = render(
			<ActionBar parentAction={null}>
				<button type="button">Delete</button>
			</ActionBar>,
		);
		const bar = container.querySelector("[data-ak-action-bar]") as HTMLElement;
		expect(bar.style.transform).toBe("");
	});

	it("nudges the bar left when Puck placed it overflowing the right edge", () => {
		mockRect = { x: 960, y: 100, width: 80, height: 24 };
		const { container } = render(
			<ActionBar parentAction={null}>
				<button type="button">Delete</button>
			</ActionBar>,
		);
		const bar = container.querySelector("[data-ak-action-bar]") as HTMLElement;
		// maxX = 1000 - 80 - 4 = 916; dx = 916 - 960 = -44
		expect(bar.style.transform).toBe("translate(-44px, 0px)");
	});

	it("nudges the bar down when Puck placed it overflowing the top edge", () => {
		mockRect = { x: 100, y: -10, width: 80, height: 24 };
		const { container } = render(
			<ActionBar parentAction={null}>
				<button type="button">Delete</button>
			</ActionBar>,
		);
		const bar = container.querySelector("[data-ak-action-bar]") as HTMLElement;
		expect(bar.style.transform).toBe("translate(0px, 14px)");
	});

	it("re-measures and corrects on window resize", () => {
		mockRect = { x: 100, y: 100, width: 80, height: 24 };
		const { container } = render(
			<ActionBar parentAction={null}>
				<button type="button">Delete</button>
			</ActionBar>,
		);
		const bar = container.querySelector("[data-ak-action-bar]") as HTMLElement;
		expect(bar.style.transform).toBe("");

		act(() => {
			mockRect = { x: 960, y: 100, width: 80, height: 24 };
			window.dispatchEvent(new Event("resize"));
		});
		expect(bar.style.transform).toBe("translate(-44px, 0px)");
	});

	it("does not loop: settles after one corrective render instead of re-triggering indefinitely", () => {
		mockRect = { x: 960, y: 100, width: 80, height: 24 };
		const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect");
		render(
			<ActionBar parentAction={null}>
				<button type="button">Delete</button>
			</ActionBar>,
		);
		// One measurement for the initial layout pass, one to confirm
		// convergence after the corrective re-render — not unbounded.
		expect(rectSpy.mock.calls.length).toBeLessThanOrEqual(4);
	});
});
