/**
 * @file CORE-P1A-002 — selection store and multi-selection model
 * (DD-0019 §10.6): primary/anchor semantics, shift-toggle, range by
 * visible order, Puck primary sync (never a history dispatch), echo
 * tolerance, and scope fencing.
 */

import { describe, expect, it, vi } from "vitest";
import {
	createEditorSelectionController,
	type InternalEditorSelectionController,
	type SelectionControllerDeps,
} from "../selection.js";

function createController(overrides?: Partial<SelectionControllerDeps>): {
	controller: InternalEditorSelectionController;
	sync: ReturnType<typeof vi.fn>;
} {
	const sync = vi.fn();
	const controller = createEditorSelectionController({
		syncPrimaryToPuck: sync,
		...overrides,
	});
	return { controller, sync };
}

describe("selection controller — core semantics (§10.6)", () => {
	it("select replaces the selection and syncs the primary to Puck", () => {
		const { controller, sync } = createController();
		controller.select("a");
		expect(controller.getState()).toEqual({
			definitionScope: "page",
			mode: "page",
			selectedIds: ["a"],
			primaryId: "a",
			anchorId: "a",
		});
		expect(sync).toHaveBeenCalledWith("a");

		controller.select("b");
		expect(controller.getState().selectedIds).toEqual(["b"]);
		expect(sync).toHaveBeenLastCalledWith("b");
	});

	it("toggle adds (making the node primary) and removes (promoting the last id)", () => {
		const { controller, sync } = createController();
		controller.select("a");
		controller.toggle("b");
		controller.toggle("c");
		expect(controller.getState().selectedIds).toEqual(["a", "b", "c"]);
		expect(controller.getState().primaryId).toBe("c");
		// The anchor stays at the initial selection for range gestures.
		expect(controller.getState().anchorId).toBe("a");

		controller.toggle("c");
		expect(controller.getState().selectedIds).toEqual(["a", "b"]);
		expect(controller.getState().primaryId).toBe("b");
		expect(sync).toHaveBeenLastCalledWith("b");

		controller.toggle("a");
		controller.toggle("b");
		expect(controller.getState().selectedIds).toEqual([]);
		expect(controller.getState().primaryId).toBeUndefined();
		expect(sync).toHaveBeenLastCalledWith(null);
	});

	it("selectRange spans anchor→target by visible order (both directions)", () => {
		const { controller } = createController();
		controller.setVisibleOrderProvider(() => ["a", "b", "c", "d", "e"]);
		controller.select("b");
		controller.selectRange("d");
		expect(controller.getState().selectedIds).toEqual(["b", "c", "d"]);
		expect(controller.getState().primaryId).toBe("d");
		expect(controller.getState().anchorId).toBe("b");

		// Reversed range keeps the anchor and re-spans.
		controller.selectRange("a");
		expect(controller.getState().selectedIds).toEqual(["a", "b"]);
		expect(controller.getState().primaryId).toBe("a");
		expect(controller.getState().anchorId).toBe("b");
	});

	it("selectRange degrades to select without a provider or anchor", () => {
		const { controller } = createController();
		controller.selectRange("x");
		expect(controller.getState().selectedIds).toEqual(["x"]);
	});

	it("selectMany dedupes, honors the primary hint, and clears on empty", () => {
		const { controller } = createController();
		controller.selectMany(["a", "b", "a", "c"], "b");
		expect(controller.getState().selectedIds).toEqual(["a", "b", "c"]);
		expect(controller.getState().primaryId).toBe("b");

		controller.selectMany([]);
		expect(controller.getState().selectedIds).toEqual([]);
	});

	it("setDefinitionScope always clears the selection (no cross-scope selections)", () => {
		const { controller } = createController();
		controller.selectMany(["a", "b"]);
		controller.setDefinitionScope("component:def-1");
		expect(controller.getState()).toEqual({
			definitionScope: "component:def-1",
			mode: "page",
			selectedIds: [],
		});
		controller.select("inner");
		controller.setDefinitionScope("page");
		expect(controller.getState().selectedIds).toEqual([]);
	});
});

describe("selection controller — Puck synchronization", () => {
	it("applies Puck-originated selection without echoing back", () => {
		const { controller, sync } = createController();
		controller.handlePuckSelectedChange("a");
		expect(controller.getState().selectedIds).toEqual(["a"]);
		expect(controller.getState().primaryId).toBe("a");
		// Puck-originated: no dispatch back to Puck.
		expect(sync).not.toHaveBeenCalled();
	});

	it("treats a re-reported primary as an echo and keeps the multi-selection", () => {
		const { controller } = createController();
		controller.select("a");
		controller.toggle("b");
		expect(controller.getState().selectedIds).toEqual(["a", "b"]);
		// Puck echoes the primary sync for "b": selection must survive.
		controller.handlePuckSelectedChange("b");
		expect(controller.getState().selectedIds).toEqual(["a", "b"]);
	});

	it("clears on Puck deselection, idempotently", () => {
		const { controller, sync } = createController();
		controller.select("a");
		sync.mockClear();
		controller.handlePuckSelectedChange(null);
		expect(controller.getState().selectedIds).toEqual([]);
		expect(sync).not.toHaveBeenCalled();
		// A second null report is a no-op.
		const before = controller.getState();
		controller.handlePuckSelectedChange(null);
		expect(controller.getState()).toBe(before);
	});

	it("notifies onChange for every applied change", () => {
		const onChange = vi.fn();
		const { controller } = createController({ onChange });
		controller.select("a");
		controller.toggle("b");
		controller.clear();
		expect(onChange).toHaveBeenCalledTimes(3);
	});
});
