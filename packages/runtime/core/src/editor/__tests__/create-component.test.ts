/**
 * Create-component-from-selection (PLAN-0020 CORE-P2-004; ED-COMP-001;
 * DD-0019 §14.3): scope/serialization/lock/limit validation, in-place
 * replacement preserving parent order, the `ComponentFrame` wrapper
 * for multi-root selections, and coverage of all three Puck
 * containment channels — including root slot props.
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	buildCreateComponentPlan,
	COMPONENT_FRAME_TYPE,
	createEmptyAuthoringState,
	indexNodeLocations,
	validateCreateComponentSelection,
} from "../index.js";

const node = (id: string, type = "Hero", props: Record<string, unknown> = {}) =>
	({ type, props: { id, ...props } }) as const;

function contentDoc(): PuckData {
	return {
		root: { props: {} },
		content: [node("a"), node("b"), node("c")],
		zones: {},
	} as unknown as PuckData;
}

/**
 * Puck 0.22 slot document: top-level children live in
 * `root.props.<slot>`, not `content`.
 */
function rootSlotDoc(): PuckData {
	return {
		root: { props: { main: [node("a"), node("b"), node("c")] } },
		content: [],
		zones: {},
	} as unknown as PuckData;
}

const INPUT = {
	name: "Card",
	definitionId: "def-1",
	instanceNodeId: "inst-1",
	timestamp: "2026-07-25T00:00:00.000Z",
};

const empty = (): AuthoringStateV1 => createEmptyAuthoringState();

describe("validateCreateComponentSelection (§14.3)", () => {
	it("accepts a single-container selection", () => {
		expect(
			validateCreateComponentSelection(contentDoc(), empty(), ["a", "b"]),
		).toEqual([]);
	});

	it("rejects an empty selection", () => {
		expect(
			validateCreateComponentSelection(contentDoc(), empty(), []).map(
				(error) => error.details?.reason,
			),
		).toContain("empty-selection");
	});

	it("rejects unknown nodes", () => {
		expect(
			validateCreateComponentSelection(contentDoc(), empty(), [
				"a",
				"ghost",
			]).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});

	it("rejects a selection spanning containers (slot boundaries)", () => {
		const data = {
			root: { props: {} },
			content: [node("a", "Box", { children: [node("inner")] }), node("b")],
			zones: {},
		} as unknown as PuckData;
		expect(
			validateCreateComponentSelection(data, empty(), ["a", "inner"]).map(
				(error) => error.details?.reason,
			),
		).toContain("selection-spans-containers");
	});

	it("rejects locked nodes", () => {
		const authoring: AuthoringStateV1 = {
			...empty(),
			nodes: { a: { version: "1", locked: true } },
		};
		expect(
			validateCreateComponentSelection(contentDoc(), authoring, ["a"]).map(
				(error) => error.code,
			),
		).toContain("EDITOR_NODE_LOCKED");
	});

	it("rejects unserializable props", () => {
		const data = {
			root: { props: {} },
			content: [node("a", "Hero", { onClick: () => undefined })],
			zones: {},
		} as unknown as PuckData;
		expect(
			validateCreateComponentSelection(data, empty(), ["a"]).map(
				(error) => error.details?.reason,
			),
		).toContain("unserializable-props");
	});

	it("rejects capturing an instance whose definition is unresolvable", () => {
		const authoring: AuthoringStateV1 = {
			...empty(),
			nodes: {
				a: {
					version: "1",
					componentInstance: {
						definitionId: "gone",
						definitionRevision: 1,
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			},
		};
		expect(
			validateCreateComponentSelection(contentDoc(), authoring, ["a"]).map(
				(error) => error.code,
			),
		).toContain("EDITOR_DEFINITION_UNAVAILABLE");
	});

	it("enforces the definition count limit", () => {
		const definitions: Record<
			string,
			AuthoringStateV1["componentDefinitions"][string]
		> = {};
		for (let index = 0; index < 500; index += 1) {
			definitions[`d${index}`] = {
				version: "1",
				id: `d${index}`,
				name: `d${index}`,
				root: { type: "X", props: {} },
				exposedProps: [],
				variantAxes: [],
				variants: [],
				revision: 1,
				createdAt: INPUT.timestamp,
				updatedAt: INPUT.timestamp,
			};
		}
		expect(
			validateCreateComponentSelection(
				contentDoc(),
				{ ...empty(), componentDefinitions: definitions },
				["a"],
			).map((error) => error.code),
		).toContain("EDITOR_LIMIT_EXCEEDED");
	});
});

describe("buildCreateComponentPlan (§14.3)", () => {
	it("replaces a single node in place and records the instance", () => {
		const plan = buildCreateComponentPlan(contentDoc(), empty(), {
			...INPUT,
			nodeIds: ["b"],
		});
		expect(plan).not.toBeNull();
		const ids = (plan?.data.content ?? []).map(
			(entry) => (entry as { props: { id: string } }).props.id,
		);
		// The instance takes the replaced node's position exactly.
		expect(ids).toEqual(["a", "inst-1", "c"]);
		expect(plan?.definition.root.type).toBe("Hero");
		expect(plan?.authoring.nodes["inst-1"]?.componentInstance).toMatchObject({
			definitionId: "def-1",
			definitionRevision: 1,
		});
		expect(plan?.authoring.componentDefinitions["def-1"]).toBeDefined();
	});

	it("wraps a multi-root selection in a ComponentFrame", () => {
		const plan = buildCreateComponentPlan(contentDoc(), empty(), {
			...INPUT,
			nodeIds: ["a", "b"],
		});
		expect(plan?.definition.root.type).toBe(COMPONENT_FRAME_TYPE);
		const children = plan?.definition.root.props.children as readonly {
			props: { id: string };
		}[];
		expect(children.map((child) => child.props.id)).toEqual(["a", "b"]);
		const ids = (plan?.data.content ?? []).map(
			(entry) => (entry as { props: { id: string } }).props.id,
		);
		expect(ids).toEqual(["inst-1", "c"]);
	});

	it("captures in document order regardless of selection order", () => {
		const plan = buildCreateComponentPlan(contentDoc(), empty(), {
			...INPUT,
			nodeIds: ["c", "a"],
		});
		const children = plan?.definition.root.props.children as readonly {
			props: { id: string };
		}[];
		expect(children.map((child) => child.props.id)).toEqual(["a", "c"]);
	});

	it("works on root-slot documents, not only `content`", () => {
		// Regression guard for the Phase 1B class of defect: a walk that
		// only covers `content` silently no-ops on slot documents.
		const plan = buildCreateComponentPlan(rootSlotDoc(), empty(), {
			...INPUT,
			nodeIds: ["b"],
		});
		expect(plan).not.toBeNull();
		const rootProps = plan?.data.root?.props as
			| { main: { props: { id: string } }[] }
			| undefined;
		expect(rootProps?.main.map((entry) => entry.props.id)).toEqual([
			"a",
			"inst-1",
			"c",
		]);
	});

	it("drops the captured nodes' authoring records", () => {
		const authoring: AuthoringStateV1 = {
			...empty(),
			nodes: { b: { version: "1", name: "Old" } },
		};
		const plan = buildCreateComponentPlan(contentDoc(), authoring, {
			...INPUT,
			nodeIds: ["b"],
		});
		expect(plan?.authoring.nodes.b).toBeUndefined();
	});

	it("never mutates its inputs", () => {
		const data = contentDoc();
		const authoring = empty();
		const dataSnapshot = JSON.parse(JSON.stringify(data));
		const authoringSnapshot = JSON.parse(JSON.stringify(authoring));
		buildCreateComponentPlan(data, authoring, {
			...INPUT,
			nodeIds: ["a", "b"],
		});
		expect(data).toEqual(dataSnapshot);
		expect(authoring).toEqual(authoringSnapshot);
	});

	it("is deterministic", () => {
		const first = buildCreateComponentPlan(contentDoc(), empty(), {
			...INPUT,
			nodeIds: ["a", "b"],
		});
		const second = buildCreateComponentPlan(contentDoc(), empty(), {
			...INPUT,
			nodeIds: ["a", "b"],
		});
		expect(first).toEqual(second);
	});

	it("returns null for an unknown node", () => {
		expect(
			buildCreateComponentPlan(contentDoc(), empty(), {
				...INPUT,
				nodeIds: ["ghost"],
			}),
		).toBeNull();
	});
});

describe("indexNodeLocations", () => {
	it("indexes all three containment channels", () => {
		const data = {
			root: { props: { main: [node("r1")] } },
			content: [node("c1", "Box", { children: [node("s1")] })],
			zones: { "c1:zone": [node("z1")] },
		} as unknown as PuckData;
		const index = indexNodeLocations(data);
		expect(index.get("c1")?.container).toBe("content");
		expect(index.get("s1")?.container).toBe("c1.children");
		expect(index.get("z1")?.container).toBe("c1:zone");
		expect(index.get("r1")?.container).toBe("root.main");
	});
});
