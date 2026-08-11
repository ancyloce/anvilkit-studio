/**
 * @file CORE-P2-009E — isolated component editing definitionScope: enter/exit
 * mechanics, selection fencing, scope-gated definition edits, and the
 * rule that scope changes never enter history
 * (DD-DEC-010; DD-0019 §14.4, §10.6; freeze §6).
 */

import type {
	EditorSelectionState,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	componentScope,
	createEditorScopeController,
	scopedDefinitionId,
} from "../components/scope.js";

/** A minimal stand-in for the selection store's scope behaviour. */
function fakeSelection(
	initial: EditorSelectionState = {
		selectedIds: [],
		definitionScope: "page",
		mode: "page",
	},
) {
	let state = initial;
	return {
		get state() {
			return state;
		},
		deps: {
			getSelection: () => state,
			setDefinitionScope: (definitionScope: EditorSelectionState["definitionScope"]) => {
				// §10.6: a scope change always clears the selection.
				state = { ...state, definitionScope, selectedIds: [] };
			},
			selectMany: (nodeIds: readonly string[]) => {
				state = { ...state, selectedIds: [...nodeIds] };
			},
		},
	};
}

describe("scope helpers", () => {
	it("round-trips a definition id through the scope literal", () => {
		expect(scopedDefinitionId(componentScope("def"))).toBe("def");
		expect(scopedDefinitionId("page")).toBeUndefined();
	});
});

describe("enter / exit (DD-DEC-010)", () => {
	it("enters a component scope and clears the selection", () => {
		const selection = fakeSelection({
			selectedIds: ["a", "b"],
			definitionScope: "page",
			mode: "page",
		});
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("def");
		expect(selection.state.definitionScope).toBe("component:def");
		// Selections can never span scopes (§10.6).
		expect(selection.state.selectedIds).toEqual([]);
		expect(controller.getDefinitionId()).toBe("def");
	});

	it("restores the prior page selection on exit", () => {
		const selection = fakeSelection({
			selectedIds: ["a", "b"],
			definitionScope: "page",
			mode: "page",
		});
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("def");
		controller.exitScope();
		expect(selection.state.definitionScope).toBe("page");
		expect(selection.state.selectedIds).toEqual(["a", "b"]);
	});

	it("exiting from page scope is a noop", () => {
		const selection = fakeSelection({ selectedIds: ["a"], definitionScope: "page", mode: "page" });
		const controller = createEditorScopeController(selection.deps);
		controller.exitScope();
		expect(selection.state.selectedIds).toEqual(["a"]);
		expect(selection.state.definitionScope).toBe("page");
	});

	it("switching between component scopes does not resurrect a stale selection", () => {
		const selection = fakeSelection({ selectedIds: ["a"], definitionScope: "page", mode: "page" });
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("one");
		controller.enterComponent("two");
		expect(selection.state.definitionScope).toBe("component:two");
		expect(selection.state.selectedIds).toEqual([]);
		// The remembered page selection is the one from the page, not
		// whatever was selected inside "one".
		controller.exitScope();
		expect(selection.state.selectedIds).toEqual(["a"]);
	});

	it("scope lives outside the document, so it records no history", () => {
		// The controller only ever calls the selection store; it holds no
		// command port and cannot dispatch. This is the freeze §6
		// guarantee expressed as a structural fact.
		const calls: string[] = [];
		const controller = createEditorScopeController({
			getSelection: () => ({ selectedIds: [], definitionScope: "page" , mode: "page"}),
			setDefinitionScope: () => calls.push("setDefinitionScope"),
			selectMany: () => calls.push("selectMany"),
		});
		controller.enterComponent("def");
		expect(calls).toEqual(["setDefinitionScope"]);
	});
});
