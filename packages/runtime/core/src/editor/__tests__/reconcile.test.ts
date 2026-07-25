/**
 * Reconciliation engine suite (PLAN-0020 CORE-P0-019): idempotency,
 * determinism, per-reference-family fixtures, ED-COMP-007 retention,
 * duplicate remap.
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	collectLiveNodeIds,
	createEmptyAuthoringState,
	reconcileAuthoringState,
	remapForDuplicate,
} from "../index.js";

function node(id: string, slotChildren: unknown[] = []) {
	return {
		type: "Box",
		props: { id, ...(slotChildren.length > 0 ? { items: slotChildren } : {}) },
	};
}

const data = {
	content: [node("a"), node("b", [node("slotChild")])],
	root: { props: {} },
	zones: { "b:zone": [node("zoned")] },
} as unknown as Data;

function populatedState(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		nodes: {
			a: {
				version: "1",
				name: "A",
				styleRefs: {
					base: ["sd", "ghost-sd"],
					overrides: { bp: ["ghost-sd"] },
				},
				interactionRefs: ["int-live", "int-dead"],
				bindingRefs: ["bind-dead"],
			},
			zoned: {
				version: "1",
				componentInstance: {
					definitionId: "missing-definition",
					definitionRevision: 1,
					variantSelection: {},
					propOverrides: { keep: "me" },
					nodeOverrides: {},
				},
			},
			ghostNode: { version: "1", name: "Ghost" },
		},
		styleDefinitions: {
			sd: {
				version: "1",
				id: "sd",
				name: "Card",
				appliesTo: "any",
				createdAt: "2026-07-22T00:00:00.000Z",
				updatedAt: "2026-07-22T00:00:00.000Z",
			},
		},
		interactions: {
			"int-live": {
				version: "1",
				id: "int-live",
				name: "Live",
				sourceNodeId: "a",
				trigger: { type: "click" },
				actions: [{ type: "url", url: "https://x.test" }],
				enabled: true,
			},
			"int-dead": {
				version: "1",
				id: "int-dead",
				name: "Dead",
				sourceNodeId: "ghostNode",
				trigger: { type: "click" },
				actions: [{ type: "url", url: "https://x.test" }],
				enabled: true,
			},
		},
		bindings: {
			"bind-dead": {
				version: "1",
				id: "bind-dead",
				nodeId: "ghostNode",
				target: { type: "visibility" },
				expression: { type: "literal", value: true },
			},
		},
	};
}

describe("collectLiveNodeIds", () => {
	it("collects content, zone, and nested slot node ids", () => {
		const ids = collectLiveNodeIds(data);
		expect([...ids].sort()).toEqual(["a", "b", "slotChild", "zoned"]);
	});

	it("tolerates missing zones and empty content", () => {
		expect(collectLiveNodeIds({ content: [] } as unknown as Data).size).toBe(0);
	});
});

describe("reconcileAuthoringState", () => {
	it("removes dead records, refs, interactions, and bindings in one pass", () => {
		const result = reconcileAuthoringState(populatedState(), data);
		expect(result.changed).toBe(true);
		expect(result.changes.removedNodeRecords).toEqual(["ghostNode"]);
		expect(result.changes.removedInteractions).toEqual(["int-dead"]);
		expect(result.changes.removedBindings).toEqual(["bind-dead"]);
		expect(result.state.nodes.a?.styleRefs).toEqual({
			base: ["sd"],
			overrides: { bp: [] },
		});
		expect(result.state.nodes.a?.interactionRefs).toEqual(["int-live"]);
		expect(result.state.nodes.a?.bindingRefs).toBeUndefined();
		expect(result.state.interactions["int-live"]).toBeDefined();
	});

	it("retains component-instance state whose definition is missing (ED-COMP-007)", () => {
		const result = reconcileAuthoringState(populatedState(), data);
		expect(result.state.nodes.zoned?.componentInstance).toEqual({
			definitionId: "missing-definition",
			definitionRevision: 1,
			variantSelection: {},
			propOverrides: { keep: "me" },
			nodeOverrides: {},
		});
	});

	it("is idempotent and deterministic", () => {
		const once = reconcileAuthoringState(populatedState(), data);
		const twice = reconcileAuthoringState(once.state, data);
		expect(twice.changed).toBe(false);
		expect(twice.state).toBe(once.state);
		const again = reconcileAuthoringState(populatedState(), data);
		expect(again.state).toEqual(once.state);
	});

	it("returns the same reference when nothing diverges", () => {
		const clean = createEmptyAuthoringState();
		const result = reconcileAuthoringState(clean, data);
		expect(result.changed).toBe(false);
		expect(result.state).toBe(clean);
	});

	it("does not mutate its input", () => {
		const state = populatedState();
		const snapshot = JSON.parse(JSON.stringify(state));
		reconcileAuthoringState(state, data);
		expect(state).toEqual(snapshot);
	});
});

describe("remapForDuplicate", () => {
	it("copies safe families and drops interaction/binding refs", () => {
		const state = populatedState();
		const result = remapForDuplicate(state, { a: "a-copy" });
		expect(result.copiedNodeIds).toEqual(["a-copy"]);
		const copy = result.state.nodes["a-copy"];
		expect(copy?.name).toBe("A");
		expect(copy?.styleRefs).toEqual(state.nodes.a?.styleRefs);
		expect(copy?.interactionRefs).toBeUndefined();
		expect(copy?.bindingRefs).toBeUndefined();
	});

	it("copies componentInstance state verbatim", () => {
		const state = populatedState();
		const result = remapForDuplicate(state, { zoned: "zoned-copy" });
		expect(result.state.nodes["zoned-copy"]?.componentInstance).toEqual(
			state.nodes.zoned?.componentInstance,
		);
	});

	it("skips unknown sources and never overwrites existing records", () => {
		const state = populatedState();
		const result = remapForDuplicate(state, {
			missing: "new-1",
			a: "zoned",
		});
		expect(result.state).toBe(state);
		expect(result.copiedNodeIds).toEqual([]);
	});
});
