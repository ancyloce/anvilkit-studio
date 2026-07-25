/**
 * @file CORE-P1B-007 — canvas multi-select: marquee intersection with
 * live selection updates, additive Shift-marquee, empty-area-only
 * arming (never over nodes or handles), and double-click drill-in
 * stepping one hierarchy level per click.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createStudioEditorBridge } from "../bridge.js";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import {
	CanvasMarquee,
	drillInTarget,
	nodeChainOf,
} from "../canvas/marquee.js";
import { AuthoringOverlayRoot } from "../canvas/overlay-root.js";
import { createEditorSelectionController } from "../selection.js";

afterEach(cleanup);

function setup() {
	const bridge = createStudioEditorBridge();
	bridge.selection = createEditorSelectionController({
		syncPrimaryToPuck: () => undefined,
		onChange: () => bridge.notify(),
	});
	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = `
		<div id="frame-root">
			<div data-ak-node="outer-1"><div data-ak-node="inner-1"><span id="leaf">x</span></div></div>
			<div data-ak-node="box-a">a</div>
			<div data-ak-node="box-b">b</div>
		</div>`;
	const rects: Record<string, DOMRect> = {
		"outer-1": { left: 0, top: 0, width: 400, height: 100 } as DOMRect,
		"inner-1": { left: 10, top: 10, width: 100, height: 50 } as DOMRect,
		"box-a": { left: 0, top: 200, width: 100, height: 50 } as DOMRect,
		"box-b": { left: 200, top: 200, width: 100, height: 50 } as DOMRect,
	};
	for (const [id, rect] of Object.entries(rects)) {
		const el = doc.querySelector(`[data-ak-node="${id}"]`) as HTMLElement;
		el.getBoundingClientRect = () => rect;
	}
	const registry = createCanvasDomRegistry();
	registry.register(doc);
	bridge.canvasRegistry = registry;
	bridge.canvasDocument = doc;
	render(
		<AuthoringOverlayRoot bridge={bridge}>
			<CanvasMarquee bridge={bridge} />
		</AuthoringOverlayRoot>,
	);
	return { bridge, doc };
}

function pointer(
	type: string,
	x: number,
	y: number,
	shift = false,
): MouseEvent {
	return new MouseEvent(type, {
		bubbles: true,
		clientX: x,
		clientY: y,
		shiftKey: shift,
	});
}

describe("canvas marquee (CORE-P1B-007)", () => {
	it("selects intersecting nodes live and shows the rubber band", async () => {
		const { bridge, doc } = setup();
		act(() => {
			doc.body.dispatchEvent(pointer("pointerdown", 0, 150));
			doc.dispatchEvent(pointer("pointermove", 150, 260));
		});
		await waitFor(() => {
			expect(doc.querySelector("[data-ak-marquee]")).not.toBeNull();
			expect(bridge.selection?.getState().selectedIds).toEqual(["box-a"]);
		});
		act(() => {
			doc.dispatchEvent(pointer("pointermove", 310, 260));
		});
		await waitFor(() =>
			expect(bridge.selection?.getState().selectedIds).toEqual([
				"box-a",
				"box-b",
			]),
		);
		act(() => {
			doc.dispatchEvent(pointer("pointerup", 310, 260));
		});
		await waitFor(() =>
			expect(doc.querySelector("[data-ak-marquee]")).toBeNull(),
		);
		expect(bridge.selection?.getState().selectedIds).toEqual([
			"box-a",
			"box-b",
		]);
	});

	it("Shift-marquee adds to the existing selection", async () => {
		const { bridge, doc } = setup();
		act(() => bridge.selection?.select("outer-1"));
		act(() => {
			doc.body.dispatchEvent(pointer("pointerdown", 0, 150, true));
			doc.dispatchEvent(pointer("pointermove", 150, 260, true));
		});
		await waitFor(() =>
			expect(bridge.selection?.getState().selectedIds).toEqual([
				"outer-1",
				"box-a",
			]),
		);
	});

	it("fences ancestor + descendant hits to the outermost node (§10.6)", async () => {
		const { bridge, doc } = setup();
		// The band crosses BOTH outer-1 and its child inner-1: only the
		// outermost may enter the selection — bulk commands need a
		// consistent sibling set, never a parent with its own child.
		act(() => {
			doc.body.dispatchEvent(pointer("pointerdown", 390, 130));
			doc.dispatchEvent(pointer("pointermove", 5, 5));
		});
		await waitFor(() =>
			expect(bridge.selection?.getState().selectedIds).toEqual(["outer-1"]),
		);
	});

	it("never arms over a node press (Puck drags keep working)", async () => {
		const { bridge, doc } = setup();
		const node = doc.querySelector('[data-ak-node="box-a"]') as HTMLElement;
		act(() => {
			node.dispatchEvent(pointer("pointerdown", 10, 210));
			doc.dispatchEvent(pointer("pointermove", 150, 260));
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(doc.querySelector("[data-ak-marquee]")).toBeNull();
		expect(bridge.selection?.getState().selectedIds).toEqual([]);
	});
});

describe("drill-in (CORE-P1B-007)", () => {
	it("computes the outermost-first chain and steps one level deeper", () => {
		const { bridge, doc } = setup();
		const leaf = doc.getElementById("leaf") as Element;
		const chain = nodeChainOf(bridge, leaf);
		expect(chain).toEqual(["outer-1", "inner-1"]);
		expect(drillInTarget(chain, undefined)).toBe("outer-1");
		expect(drillInTarget(chain, "outer-1")).toBe("inner-1");
		expect(drillInTarget(chain, "inner-1")).toBe("inner-1");
		expect(drillInTarget(chain, "unrelated")).toBe("outer-1");
	});

	it("double-click drills the selection in", async () => {
		const { bridge, doc } = setup();
		const leaf = doc.getElementById("leaf") as Element;
		act(() => {
			leaf.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		await waitFor(() =>
			expect(bridge.selection?.getState().primaryId).toBe("outer-1"),
		);
		act(() => {
			leaf.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		});
		await waitFor(() =>
			expect(bridge.selection?.getState().primaryId).toBe("inner-1"),
		);
	});
});
