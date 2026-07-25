/**
 * Override reset granularity (PLAN-0020 CORE-P2-008; ED-COMP-008;
 * DD-0019 §14.6; freeze §3.3–§3.5): reset-one, reset-all, and
 * promote — including promote's atomicity (definition gains the
 * value, instance loses the redundant override, one reduction).
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	EditorCommandBase,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	createEmptyAuthoringState,
	materializeInstance,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `ovr-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

const DEFINITION: ComponentDefinitionV1 = {
	version: "1",
	id: "def",
	name: "Card",
	root: { type: "Box", props: { id: "n-root", label: "base", size: 1 } },
	exposedProps: [],
	variantAxes: [],
	variants: [],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function doc(
	nodeOverrides: Record<string, unknown> = {},
	propOverrides: Record<string, unknown> = {},
	extraInstances: readonly string[] = [],
): AuthoringStateV1 {
	const nodes: Record<string, AuthoringStateV1["nodes"][string]> = {
		i1: {
			version: "1",
			componentInstance: {
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: {},
				propOverrides: propOverrides as never,
				nodeOverrides: nodeOverrides as never,
			},
		},
	};
	for (const id of extraInstances) {
		nodes[id] = {
			version: "1",
			componentInstance: {
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: {},
			},
		};
	}
	return {
		...createEmptyAuthoringState(),
		componentDefinitions: { def: DEFINITION },
		nodes,
	};
}

const overridesOf = (state: AuthoringStateV1, id = "i1") =>
	state.nodes[id]?.componentInstance?.nodeOverrides ?? {};

describe("reset-one (freeze §3.3)", () => {
	it("removes one prop override and leaves siblings", () => {
		const state = doc({ "n-root": { props: { label: "x", size: 9 } } });
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.reset",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		}).state;
		expect(overridesOf(next)["n-root"]).toEqual({ props: { size: 9 } });
	});

	it("drops the patch entirely when the last property goes", () => {
		const state = doc({ "n-root": { props: { label: "x" } } });
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.reset",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		}).state;
		expect(overridesOf(next)["n-root"]).toBeUndefined();
	});

	it("removes a responsive family value at the addressed layer only", () => {
		const state = doc({
			"n-root": {
				layout: { base: { gap: px(2) }, overrides: { tablet: { gap: px(4) } } },
			},
		});
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.reset",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["layout", "gap"] },
			layer: "base",
		}).state;
		expect(overridesOf(next)["n-root"]).toEqual({
			layout: { overrides: { tablet: { gap: px(4) } } },
		});
	});

	it("is a noop for an address that matches nothing (freeze §8)", () => {
		const state = doc({ "n-root": { props: { label: "x" } } });
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.reset",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["absent"] },
			layer: "base",
		});
		expect(result.status).toBe("noop");
		expect(result.errors.filter((e) => e.severity === "error")).toEqual([]);
	});

	it("is a noop for an unknown definition node", () => {
		const state = doc({ "n-root": { props: { label: "x" } } });
		expect(
			applyEditorCommand(state, {
				...base(state.revision),
				type: "component.override.reset",
				instanceNodeId: "i1",
				target: { definitionNodeId: "n-gone", propertyPath: ["label"] },
				layer: "base",
			}).status,
		).toBe("noop");
	});

	it("rejects an empty property path", () => {
		const state = doc({ "n-root": { props: { label: "x" } } });
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.override.reset",
				instanceNodeId: "i1",
				target: { definitionNodeId: "n-root", propertyPath: [] },
				layer: "base",
			}).map((error) => error.details?.reason),
		).toContain("empty-property-path");
	});

	it("rejects a node that is not an instance", () => {
		const state = doc();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.override.reset",
				instanceNodeId: "nope",
				target: { definitionNodeId: "n-root", propertyPath: ["label"] },
				layer: "base",
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});
});

describe("reset-all (freeze §3.4)", () => {
	it("clears prop and node overrides across all layers", () => {
		const state = doc(
			{
				"n-root": {
					props: { label: "x" },
					layout: { base: { gap: px(2) }, overrides: { tablet: {} } },
				},
			},
			{ "p-1": "y" },
		);
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.resetAll",
			instanceNodeIds: ["i1"],
		}).state;
		expect(next.nodes.i1?.componentInstance?.nodeOverrides).toEqual({});
		expect(next.nodes.i1?.componentInstance?.propOverrides).toEqual({});
	});

	it("handles multiple instances as one intent", () => {
		const state = doc({ "n-root": { props: { label: "x" } } }, {}, ["i2"]);
		const withSecond: AuthoringStateV1 = {
			...state,
			nodes: {
				...state.nodes,
				i2: {
					version: "1",
					componentInstance: {
						...state.nodes.i2!.componentInstance!,
						propOverrides: { p: "z" } as never,
					},
				},
			},
		};
		const result = applyEditorCommand(withSecond, {
			...base(withSecond.revision),
			type: "component.override.resetAll",
			instanceNodeIds: ["i1", "i2"],
		});
		expect(result.status).toBe("changed");
		// One transaction, one revision bump.
		expect(result.state.revision).toBe(withSecond.revision + 1);
		expect(result.state.nodes.i1?.componentInstance?.nodeOverrides).toEqual({});
		expect(result.state.nodes.i2?.componentInstance?.propOverrides).toEqual({});
	});

	it("is a noop when nothing is overridden", () => {
		const state = doc();
		expect(
			applyEditorCommand(state, {
				...base(state.revision),
				type: "component.override.resetAll",
				instanceNodeIds: ["i1"],
			}).status,
		).toBe("noop");
	});
});

describe("promote (freeze §3.5)", () => {
	it("writes the value into the definition and drops the instance override", () => {
		const state = doc({ "n-root": { props: { label: "promoted" } } });
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.promote",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		});
		expect(result.status).toBe("changed");
		// Definition gained the value...
		expect(result.state.componentDefinitions.def?.root.props.label).toBe(
			"promoted",
		);
		// ...and the now-redundant instance override is gone.
		expect(overridesOf(result.state)["n-root"]).toBeUndefined();
		// Propagation is observable via the revision bump.
		expect(result.state.componentDefinitions.def?.revision).toBe(2);
	});

	it("is atomic — one transaction, one revision bump", () => {
		const state = doc({ "n-root": { props: { label: "promoted" } } });
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.promote",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		});
		expect(result.state.revision).toBe(state.revision + 1);
	});

	it("propagates to sibling instances while the promoter looks unchanged", () => {
		const state = doc({ "n-root": { props: { label: "promoted" } } }, {}, [
			"i2",
		]);
		const before = materializeInstance(
			"i1",
			state.nodes.i1!.componentInstance!,
			state.componentDefinitions,
		);
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.promote",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		}).state;

		const after = materializeInstance(
			"i1",
			next.nodes.i1!.componentInstance!,
			next.componentDefinitions,
		);
		const sibling = materializeInstance(
			"i2",
			next.nodes.i2!.componentInstance!,
			next.componentDefinitions,
		);
		if (
			before.status !== "materialized" ||
			after.status !== "materialized" ||
			sibling.status !== "materialized"
		) {
			throw new Error("expected materialized");
		}
		// The promoter's rendered result is unchanged...
		expect(after.node.props.label).toBe(before.node.props.label);
		// ...and the sibling now shows the promoted default.
		expect(sibling.node.props.label).toBe("promoted");
	});

	it("rejects promoting when the definition is unavailable", () => {
		const state: AuthoringStateV1 = {
			...doc({ "n-root": { props: { label: "x" } } }),
			componentDefinitions: {},
		};
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.override.promote",
				instanceNodeId: "i1",
				target: { definitionNodeId: "n-root", propertyPath: ["label"] },
				layer: "base",
			}).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_UNAVAILABLE");
	});

	it("is a noop when there is no such override", () => {
		const state = doc();
		expect(
			applyEditorCommand(state, {
				...base(state.revision),
				type: "component.override.promote",
				instanceNodeId: "i1",
				target: { definitionNodeId: "n-root", propertyPath: ["label"] },
				layer: "base",
			}).status,
		).toBe("noop");
	});

	it("does not promote authoring-family addresses", () => {
		// Families are per-node presentation, not definition defaults;
		// a partial promote would be worse than none.
		const state = doc({ "n-root": { layout: { base: { gap: px(3) } } } });
		expect(
			applyEditorCommand(state, {
				...base(state.revision),
				type: "component.override.promote",
				instanceNodeId: "i1",
				target: { definitionNodeId: "n-root", propertyPath: ["layout", "gap"] },
				layer: "base",
			}).status,
		).toBe("noop");
	});
});
