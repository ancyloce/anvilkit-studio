/**
 * @file CORE-P2-009E — isolated component editing scope: enter/exit
 * mechanics, selection fencing, scope-gated definition edits, and the
 * rule that scope changes never enter history
 * (DD-DEC-010; DD-0019 §14.4, §10.6; freeze §6).
 */

import type {
	EditorCommand,
	EditorSelectionState,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	componentScope,
	createEditorScopeController,
	scopedDefinitionId,
	scopeGuardError,
} from "../components/scope.js";

/** A minimal stand-in for the selection store's scope behaviour. */
function fakeSelection(
	initial: EditorSelectionState = {
		selectedIds: [],
		scope: "page",
	},
) {
	let state = initial;
	return {
		get state() {
			return state;
		},
		deps: {
			getSelection: () => state,
			setScope: (scope: EditorSelectionState["scope"]) => {
				// §10.6: a scope change always clears the selection.
				state = { ...state, scope, selectedIds: [] };
			},
			selectMany: (nodeIds: readonly string[]) => {
				state = { ...state, selectedIds: [...nodeIds] };
			},
		},
	};
}

const base = {
	id: "c1",
	expectedRevision: 0,
	source: "inspector" as const,
	timestamp: 1_750_000_000_000,
};

const definitionIdOf = (command: EditorCommand): string | undefined =>
	command.type === "component.definition.update"
		? command.definitionId
		: command.type === "component.override.promote"
			? "def"
			: undefined;

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
			scope: "page",
		});
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("def");
		expect(selection.state.scope).toBe("component:def");
		// Selections can never span scopes (§10.6).
		expect(selection.state.selectedIds).toEqual([]);
		expect(controller.getDefinitionId()).toBe("def");
	});

	it("restores the prior page selection on exit", () => {
		const selection = fakeSelection({
			selectedIds: ["a", "b"],
			scope: "page",
		});
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("def");
		controller.exitScope();
		expect(selection.state.scope).toBe("page");
		expect(selection.state.selectedIds).toEqual(["a", "b"]);
	});

	it("exiting from page scope is a noop", () => {
		const selection = fakeSelection({ selectedIds: ["a"], scope: "page" });
		const controller = createEditorScopeController(selection.deps);
		controller.exitScope();
		expect(selection.state.selectedIds).toEqual(["a"]);
		expect(selection.state.scope).toBe("page");
	});

	it("switching between component scopes does not resurrect a stale selection", () => {
		const selection = fakeSelection({ selectedIds: ["a"], scope: "page" });
		const controller = createEditorScopeController(selection.deps);
		controller.enterComponent("one");
		controller.enterComponent("two");
		expect(selection.state.scope).toBe("component:two");
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
			getSelection: () => ({ selectedIds: [], scope: "page" }),
			setScope: () => calls.push("setScope"),
			selectMany: () => calls.push("selectMany"),
		});
		controller.enterComponent("def");
		expect(calls).toEqual(["setScope"]);
	});
});

describe("definition edits are scope-gated (freeze §6)", () => {
	const update: EditorCommand = {
		...base,
		type: "component.definition.update",
		definitionId: "def",
		patch: { name: "x" },
	};

	it("rejects a definition update issued from page scope", () => {
		const error = scopeGuardError("page", update, definitionIdOf);
		expect(error?.code).toBe("EDITOR_CAPABILITY_UNSUPPORTED");
		expect(error?.details?.reason).toBe("definition-edit-outside-scope");
	});

	it("allows it inside the matching component scope", () => {
		expect(
			scopeGuardError(componentScope("def"), update, definitionIdOf),
		).toBeNull();
	});

	it("rejects it inside a different component's scope", () => {
		expect(
			scopeGuardError(componentScope("other"), update, definitionIdOf),
		).not.toBeNull();
	});

	it("gates promote the same way", () => {
		const promote: EditorCommand = {
			...base,
			type: "component.override.promote",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n", propertyPath: ["label"] },
			layer: "base",
		};
		expect(scopeGuardError("page", promote, definitionIdOf)).not.toBeNull();
		expect(
			scopeGuardError(componentScope("def"), promote, definitionIdOf),
		).toBeNull();
	});

	it("leaves non-definition commands alone in every scope", () => {
		const rename: EditorCommand = {
			...base,
			type: "node.rename",
			nodeId: "n1",
			name: "Hero",
		};
		expect(scopeGuardError("page", rename, definitionIdOf)).toBeNull();
		expect(
			scopeGuardError(componentScope("def"), rename, definitionIdOf),
		).toBeNull();
	});

	it("rejects the whole batch when one member is out of scope", () => {
		// All-or-nothing batching means a single out-of-scope member
		// must take the transaction down with it.
		const batch: EditorCommand = {
			...base,
			type: "batch",
			label: "mixed",
			commands: [
				{ ...base, type: "node.rename", nodeId: "n1", name: "Hero" },
				update,
			],
		};
		expect(scopeGuardError("page", batch, definitionIdOf)).not.toBeNull();
		expect(
			scopeGuardError(componentScope("def"), batch, definitionIdOf),
		).toBeNull();
	});
});
