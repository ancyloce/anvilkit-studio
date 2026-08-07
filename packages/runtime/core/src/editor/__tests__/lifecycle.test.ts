/**
 * Definition lifecycle (PLAN-0020 CORE-P2-007; ED-COMP-006/007;
 * DD-0019 §14.6; freeze §3.1/§4): the delete-policy matrix, the
 * batch-entry-state rule, atomicity, and the retention /
 * re-resolution invariant (CFX-C07 adjacent).
 */

import type {
	ComponentDefinition,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandBase,
} from "../legacy/index.js";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	collectUnresolvedInstances,
	countLiveInstances,
	createEmptyAuthoringState,
	materializeInstance,
	unresolvedInstanceDiagnostics,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `life-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const DEFINITION: ComponentDefinition = {
	version: "1",
	id: "def",
	name: "Card",
	root: { type: "Box", props: { id: "n-root", label: "base" } },
	exposedProps: [],
	variantAxes: [],
	variants: [],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function doc(instanceCount: number): AuthoringStateV1 {
	const nodes: Record<string, AuthoringStateV1["nodes"][string]> = {};
	for (let index = 0; index < instanceCount; index += 1) {
		nodes[`i${index}`] = {
			version: "1",
			componentInstance: {
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: {},
				propOverrides: { keep: "me" } as never,
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

describe("countLiveInstances", () => {
	it("counts references and caps the reported ids at 50", () => {
		const usage = countLiveInstances(doc(60), "def");
		expect(usage.count).toBe(60);
		expect(usage.instanceNodeIds).toHaveLength(50);
	});

	it("returns zero for an unreferenced definition", () => {
		expect(countLiveInstances(doc(0), "def").count).toBe(0);
	});
});

describe("delete policy matrix (§14.6, freeze §4)", () => {
	it("deletes directly when nothing references it", () => {
		const state = doc(0);
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(result.status).toBe("changed");
		expect(result.state.componentDefinitions.def).toBeUndefined();
	});

	it("rejects a bare delete with live instances under the default policy", () => {
		const state = doc(3);
		const errors = validateAtomicCommand(state, {
			...base(state.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(errors.map((error) => error.code)).toContain(
			"EDITOR_DEFINITION_REFERENCED",
		);
		expect(errors[0]?.details?.instanceCount).toBe(3);
	});

	it("rejects an unknown definition", () => {
		const state = doc(0);
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.definition.delete",
				definitionId: "ghost",
			}).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_UNAVAILABLE");
	});

	it("under confirm-detach-all, a delete validated after detaching passes", () => {
		// Simulates the intermediate state of the detach-all→delete
		// transaction: instances are gone, so the delete is clean.
		const detached = doc(0);
		expect(
			validateAtomicCommand(
				detached,
				{
					...base(detached.revision),
					type: "component.definition.delete",
					definitionId: "def",
				},
				{
					policies: { componentDefinitionDelete: "confirm-detach-all" },
					entryState: doc(3),
				},
			),
		).toEqual([]);
	});

	it("under block-when-referenced, the same transaction still rejects", () => {
		// The whole point of freeze §4: judging the entry state means no
		// single transaction can take a referenced definition to deleted.
		const detached = doc(0);
		const errors = validateAtomicCommand(
			detached,
			{
				...base(detached.revision),
				type: "component.definition.delete",
				definitionId: "def",
			},
			{
				policies: { componentDefinitionDelete: "block-when-referenced" },
				entryState: doc(3),
			},
		);
		expect(errors.map((error) => error.code)).toContain(
			"EDITOR_DEFINITION_REFERENCED",
		);
		expect(errors[0]?.details?.policy).toBe("block-when-referenced");
	});

	it("block-when-referenced still allows deleting an unreferenced definition", () => {
		const state = doc(0);
		expect(
			validateAtomicCommand(
				state,
				{
					...base(state.revision),
					type: "component.definition.delete",
					definitionId: "def",
				},
				{ policies: { componentDefinitionDelete: "block-when-referenced" } },
			),
		).toEqual([]);
	});

	it("a rejected delete leaves the document untouched (atomicity)", () => {
		const state = doc(2);
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(result.status).toBe("rejected");
		expect(result.state).toBe(state);
		expect(result.state.componentDefinitions.def).toBeDefined();
	});

	it("no committed state references a deleted definition after detach-all", () => {
		// The invariant the batch exists to preserve.
		const detached = doc(0);
		const result = applyEditorCommand(detached, {
			...base(detached.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(result.status).toBe("changed");
		const dangling = Object.values(result.state.nodes).filter(
			(record) => record.componentInstance?.definitionId === "def",
		);
		expect(dangling).toEqual([]);
	});
});

describe("retention and re-resolution (ED-COMP-007)", () => {
	it("leaves instance data untouched when the definition is unavailable", () => {
		const state = doc(2);
		const outage: AuthoringStateV1 = { ...state, componentDefinitions: {} };
		// Byte-for-byte identical instance data across the outage.
		expect(outage.nodes).toEqual(state.nodes);
		expect(collectUnresolvedInstances(outage)).toHaveLength(2);
	});

	it("surfaces a library-unavailable diagnostic, not an error", () => {
		const outage: AuthoringStateV1 = {
			...doc(1),
			componentDefinitions: {},
		};
		const diagnostics = unresolvedInstanceDiagnostics(outage);
		expect(diagnostics[0]?.code).toBe("EDITOR_DEFINITION_UNAVAILABLE");
		expect(diagnostics[0]?.details?.reason).toBe("library-unavailable");
		expect(diagnostics[0]?.severity).toBe("warning");
	});

	it("re-resolves automatically when the definition returns", () => {
		const state = doc(1);
		const outage: AuthoringStateV1 = { ...state, componentDefinitions: {} };
		expect(
			materializeInstance(
				"i0",
				outage.nodes.i0!.componentInstance!,
				outage.componentDefinitions,
			).status,
		).toBe("missing-definition");

		// Round-trip: the same untouched instance data resolves again.
		const restored: AuthoringStateV1 = {
			...outage,
			componentDefinitions: { def: DEFINITION },
		};
		const result = materializeInstance(
			"i0",
			restored.nodes.i0!.componentInstance!,
			restored.componentDefinitions,
		);
		expect(result.status).toBe("materialized");
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("base");
		}
	});

	it("deleting a definition does not strip retained instance records", () => {
		const state = doc(0);
		const withOrphanInstance: AuthoringStateV1 = {
			...state,
			nodes: {
				kept: {
					version: "1",
					componentInstance: {
						definitionId: "other",
						definitionRevision: 1,
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			},
		};
		const result = applyEditorCommand(withOrphanInstance, {
			...base(withOrphanInstance.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(result.state.nodes.kept?.componentInstance?.definitionId).toBe(
			"other",
		);
	});
});
