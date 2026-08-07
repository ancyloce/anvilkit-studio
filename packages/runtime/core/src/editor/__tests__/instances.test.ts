/**
 * Instance editing, propagation, detach, and orphan diagnostics
 * (PLAN-0020 CORE-P2-006; ED-COMP-002/003/004; DD-0019 §14.2, §14.4;
 * ADR 0005 CFX-C01/C08/C09 behaviours).
 */

import type {
	ComponentDefinition,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandBase,
} from "../legacy/index.js";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	buildDetachPlan,
	collectOrphanOverrides,
	createEmptyAuthoringState,
	isDetachFailure,
	materializeInstance,
	orphanOverrideDiagnostics,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `inst-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

const DEFINITION: ComponentDefinition = {
	version: "1",
	id: "def",
	name: "Card",
	root: {
		type: "Box",
		props: {
			id: "n-root",
			label: "base",
			children: [{ type: "Text", props: { id: "n-text", text: "hi" } }],
		},
	} as unknown as SerializablePuckNode,
	exposedProps: [
		{ id: "p-label", name: "Label", type: "text", sourcePath: ["label"] },
	],
	variantAxes: [],
	variants: [],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function docWithInstances(ids: readonly string[]): AuthoringStateV1 {
	const nodes: Record<string, AuthoringStateV1["nodes"][string]> = {};
	for (const id of ids) {
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

const puckDoc = (ids: readonly string[]): PuckData =>
	({
		root: { props: {} },
		content: ids.map((id) => ({ type: "Box", props: { id } })),
		zones: {},
	}) as unknown as PuckData;

let idSeq = 0;
const generateId = (type: string) => `${type}-new-${++idSeq}`;

describe("instance overrides (ED-COMP-002/003)", () => {
	it("sets and clears an exposed-property override", () => {
		let state = docWithInstances(["i1"]);
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.instance.propOverride.set",
			instanceNodeId: "i1",
			propId: "p-label",
			value: "custom",
		}).state;
		expect(state.nodes.i1?.componentInstance?.propOverrides["p-label"]).toBe(
			"custom",
		);

		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.instance.propOverride.set",
			instanceNodeId: "i1",
			propId: "p-label",
			value: null,
		}).state;
		expect(state.nodes.i1?.componentInstance?.propOverrides).toEqual({});
	});

	it("sets and clears a node override", () => {
		let state = docWithInstances(["i1"]);
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.instance.nodeOverride.set",
			instanceNodeId: "i1",
			definitionNodeId: "n-text",
			patch: { layout: { base: { gap: px(6) } } },
		}).state;
		expect(state.nodes.i1?.componentInstance?.nodeOverrides["n-text"]).toEqual({
			layout: { base: { gap: px(6) } },
		});

		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.instance.nodeOverride.set",
			instanceNodeId: "i1",
			definitionNodeId: "n-text",
			patch: null,
		}).state;
		expect(state.nodes.i1?.componentInstance?.nodeOverrides).toEqual({});
	});

	it("rejects a runtime composite id as an override key (§14.2)", () => {
		const state = docWithInstances(["i1"]);
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.nodeOverride.set",
				instanceNodeId: "i1",
				definitionNodeId: "i1::n-text",
				patch: {},
			}).map((error) => error.details?.reason),
		).toContain("runtime-id-as-override-key");
	});

	it("rejects editing a node that is not an instance", () => {
		const state = createEmptyAuthoringState();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.propOverride.set",
				instanceNodeId: "plain",
				propId: "p",
				value: "x",
			}).map((error) => error.details?.kind),
		).toContain("componentInstance");
	});

	it("rejects editing an instance whose definition is unavailable", () => {
		const state: AuthoringStateV1 = {
			...docWithInstances(["i1"]),
			componentDefinitions: {},
		};
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.propOverride.set",
				instanceNodeId: "i1",
				propId: "p-label",
				value: "x",
			}).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_UNAVAILABLE");
	});
});

describe("propagation without copies (ED-COMP-002; CFX-C01/C08)", () => {
	it("a definition edit reaches every instance, overrides intact", () => {
		const state = docWithInstances(["i1", "i2"]);
		const withOverride: AuthoringStateV1 = {
			...state,
			nodes: {
				...state.nodes,
				i2: {
					version: "1",
					componentInstance: {
						...state.nodes.i2!.componentInstance!,
						propOverrides: { "p-label": "kept" },
					},
				},
			},
		};

		const edited: AuthoringStateV1 = {
			...withOverride,
			componentDefinitions: {
				def: {
					...DEFINITION,
					root: {
						...DEFINITION.root,
						props: { ...DEFINITION.root.props, label: "edited" },
					} as SerializablePuckNode,
					revision: 2,
				},
			},
		};

		const first = materializeInstance(
			"i1",
			edited.nodes.i1!.componentInstance!,
			edited.componentDefinitions,
		);
		const second = materializeInstance(
			"i2",
			edited.nodes.i2!.componentInstance!,
			edited.componentDefinitions,
		);
		expect(first.status).toBe("materialized");
		if (first.status === "materialized") {
			expect(first.node.props.label).toBe("edited");
		}
		if (second.status === "materialized") {
			// The instance's own override survives the definition edit.
			expect(second.node.props.label).toBe("kept");
		}
	});

	it("serialized instances carry a reference, never a resolved subtree", () => {
		const state = docWithInstances(["i1", "i2", "i3"]);
		const serialized = JSON.stringify(state.nodes);
		// CFX-C01: document size does not scale with definition size.
		expect(serialized).not.toContain("n-text");
		expect(serialized).not.toContain('"label"');
	});
});

describe("orphan overrides (ED-COMP-003; CFX-C09)", () => {
	it("reports overrides whose target definition node is gone", () => {
		const state = docWithInstances(["i1"]);
		const withOrphan: AuthoringStateV1 = {
			...state,
			nodes: {
				i1: {
					version: "1",
					componentInstance: {
						...state.nodes.i1!.componentInstance!,
						nodeOverrides: { "n-removed": { props: { x: 1 } } },
					},
				},
			},
		};
		expect(collectOrphanOverrides(withOrphan)).toEqual([
			{
				instanceNodeId: "i1",
				definitionId: "def",
				definitionNodeId: "n-removed",
			},
		]);
		const diagnostics = orphanOverrideDiagnostics(withOrphan);
		expect(diagnostics[0]?.details?.kind).toBe("orphanOverride");
		// Diagnosable data, not an error that blocks work.
		expect(diagnostics[0]?.severity).toBe("warning");
	});

	it("retains the orphan rather than dropping or reapplying it", () => {
		const state = docWithInstances(["i1"]);
		const withOrphan: AuthoringStateV1 = {
			...state,
			nodes: {
				i1: {
					version: "1",
					componentInstance: {
						...state.nodes.i1!.componentInstance!,
						nodeOverrides: { "n-removed": { props: { label: "ghost" } } },
					},
				},
			},
		};
		const result = materializeInstance(
			"i1",
			withOrphan.nodes.i1!.componentInstance!,
			withOrphan.componentDefinitions,
		);
		expect(result.status).toBe("materialized");
		if (result.status === "materialized") {
			// Never applied to some other node.
			expect(result.node.props.label).toBe("base");
		}
		// Still present in the document.
		expect(
			withOrphan.nodes.i1?.componentInstance?.nodeOverrides["n-removed"],
		).toBeDefined();
	});

	it("does not confuse an unresolvable definition with an orphan", () => {
		const state: AuthoringStateV1 = {
			...docWithInstances(["i1"]),
			componentDefinitions: {},
		};
		expect(collectOrphanOverrides(state)).toEqual([]);
	});
});

describe("detach (ED-COMP-004; CFX-C05 appearance equivalence)", () => {
	it("materializes into ordinary nodes with fresh ids", () => {
		const authoring = docWithInstances(["i1"]);
		const plan = buildDetachPlan(
			puckDoc(["i1"]),
			authoring,
			["i1"],
			generateId,
		);
		expect(plan).not.toBeNull();
		expect(isDetachFailure(plan)).toBe(false);
		if (plan === null || isDetachFailure(plan)) {
			return;
		}
		const rootNode = plan.data.content?.[0] as
			| { props: { id: string } }
			| undefined;
		const rootId = rootNode?.props.id;
		// Fresh id — never the runtime composite form (§14.2).
		expect(rootId).not.toBe("i1");
		expect(rootId).not.toContain("::");
		expect(plan.replacements.i1).toBe(rootId);
		// The instance reference is gone.
		expect(plan.authoring.nodes.i1).toBeUndefined();
	});

	it("carries resolved authoring onto the detached nodes", () => {
		const authoring = docWithInstances(["i1"]);
		const withOverride: AuthoringStateV1 = {
			...authoring,
			nodes: {
				i1: {
					version: "1",
					componentInstance: {
						...authoring.nodes.i1!.componentInstance!,
						nodeOverrides: { "n-text": { layout: { base: { gap: px(7) } } } },
					},
				},
			},
		};
		const plan = buildDetachPlan(
			puckDoc(["i1"]),
			withOverride,
			["i1"],
			generateId,
		);
		if (plan === null || isDetachFailure(plan)) {
			throw new Error("expected a plan");
		}
		const carried = Object.values(plan.authoring.nodes).some(
			(record) => record.layout?.base?.gap !== undefined,
		);
		expect(carried).toBe(true);
	});

	it("rejects detaching an instance whose definition is unavailable", () => {
		const authoring: AuthoringStateV1 = {
			...docWithInstances(["i1"]),
			componentDefinitions: {},
		};
		const plan = buildDetachPlan(
			puckDoc(["i1"]),
			authoring,
			["i1"],
			generateId,
		);
		expect(isDetachFailure(plan)).toBe(true);
		if (isDetachFailure(plan)) {
			expect(plan.reason.status).toBe("missing-definition");
		}
	});

	it("is a noop for a node that is not an instance", () => {
		expect(
			buildDetachPlan(
				puckDoc(["plain"]),
				createEmptyAuthoringState(),
				["plain"],
				generateId,
			),
		).toBeNull();
	});

	it("never mutates its inputs", () => {
		const data = puckDoc(["i1"]);
		const authoring = docWithInstances(["i1"]);
		const dataSnapshot = JSON.parse(JSON.stringify(data));
		const authoringSnapshot = JSON.parse(JSON.stringify(authoring));
		buildDetachPlan(data, authoring, ["i1"], generateId);
		expect(data).toEqual(dataSnapshot);
		expect(authoring).toEqual(authoringSnapshot);
	});
});
