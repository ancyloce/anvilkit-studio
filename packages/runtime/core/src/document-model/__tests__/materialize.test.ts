/**
 * Instance materialization (PLAN-0020 CORE-P2-005; ED-COMP-005;
 * DD-0019 §14.2, §24.4): the fixed precedence chain, DFS cycle
 * detection with a full path, the depth cap, runtime-id namespacing,
 * and purity/determinism.
 */

import type {
	ComponentDefinition,
	ComponentInstanceState,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	CANONICAL_COMPONENT_INSTANCE_PROP,
	formatComponentPath,
	materializeInstance,
	runtimeNodeId,
} from "../index.js";

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

function definition(
	partial: Partial<ComponentDefinition> & Pick<ComponentDefinition, "id">,
): ComponentDefinition {
	return {
		version: "1",
		name: partial.id,
		root: { type: "Box", props: { id: "n-root" } },
		exposedProps: [],
		variantAxes: [],
		variants: [],
		revision: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...partial,
	} as ComponentDefinition;
}

function instance(
	partial: Partial<ComponentInstanceState> &
		Pick<ComponentInstanceState, "definitionId">,
): ComponentInstanceState {
	return {
		definitionRevision: 1,
		variantSelection: {},
		propOverrides: {},
		nodeOverrides: {},
		...partial,
	};
}

const materialized = (result: ReturnType<typeof materializeInstance>) => {
	if (result.status !== "materialized") {
		throw new Error(`expected materialized, got ${result.status}`);
	}
	return result;
};

describe("runtime ids (§14.2)", () => {
	it("namespaces definition node ids under the instance", () => {
		const result = materialized(
			materializeInstance("inst-1", instance({ definitionId: "d" }), {
				d: definition({ id: "d" }),
			}),
		);
		expect(result.node.props.id).toBe(runtimeNodeId("inst-1", "n-root"));
		expect(result.node.props.id).toBe("inst-1::n-root");
	});

	it("namespaces nested children distinctly per instance", () => {
		const definitions = {
			d: definition({
				id: "d",
				root: {
					type: "Box",
					props: {
						id: "n-root",
						children: [{ type: "Text", props: { id: "n-child" } }],
					},
				} as unknown as SerializablePuckNode,
			}),
		};
		const one = materialized(
			materializeInstance("i1", instance({ definitionId: "d" }), definitions),
		);
		const two = materialized(
			materializeInstance("i2", instance({ definitionId: "d" }), definitions),
		);
		const childId = (node: SerializablePuckNode) =>
			(node.props.children as { props: { id: string } }[])[0]?.props.id;
		expect(childId(one.node)).toBe("i1::n-child");
		expect(childId(two.node)).toBe("i2::n-child");
		// No collision between instances of the same definition.
		expect(childId(one.node)).not.toBe(childId(two.node));
	});
});

describe("§24.4 precedence chain", () => {
	const base = definition({
		id: "d",
		root: { type: "Box", props: { id: "n-root", label: "base" } },
		exposedProps: [
			{ id: "p-label", name: "Label", type: "text", sourcePath: ["label"] },
		],
		variantAxes: [
			{
				id: "size",
				name: "Size",
				options: [
					{ id: "sm", name: "Small" },
					{ id: "lg", name: "Large" },
				],
			},
		],
		variants: [
			{
				id: "v-lg",
				selection: { size: "lg" },
				patch: { "n-root": { props: { label: "variant" } } },
			},
		],
	});

	it("definition base applies with no overrides", () => {
		const result = materialized(
			materializeInstance("i", instance({ definitionId: "d" }), { d: base }),
		);
		expect(result.node.props.label).toBe("base");
	});

	it("variant patch beats the definition base", () => {
		const result = materialized(
			materializeInstance(
				"i",
				instance({ definitionId: "d", variantSelection: { size: "lg" } }),
				{ d: base },
			),
		);
		expect(result.node.props.label).toBe("variant");
	});

	it("exposed property beats the variant patch", () => {
		const result = materialized(
			materializeInstance(
				"i",
				instance({
					definitionId: "d",
					variantSelection: { size: "lg" },
					propOverrides: { "p-label": "exposed" },
				}),
				{ d: base },
			),
		);
		expect(result.node.props.label).toBe("exposed");
	});

	it("node override beats the exposed property", () => {
		const result = materialized(
			materializeInstance(
				"i",
				instance({
					definitionId: "d",
					variantSelection: { size: "lg" },
					propOverrides: { "p-label": "exposed" },
					nodeOverrides: { "n-root": { props: { label: "override" } } },
				}),
				{ d: base },
			),
		);
		expect(result.node.props.label).toBe("override");
	});

	it("removing each layer falls back to the next one down (CFX-C05)", () => {
		const full = materialized(
			materializeInstance(
				"i",
				instance({
					definitionId: "d",
					variantSelection: { size: "lg" },
					propOverrides: { "p-label": "exposed" },
					nodeOverrides: { "n-root": { props: { label: "override" } } },
				}),
				{ d: base },
			),
		);
		expect(full.node.props.label).toBe("override");

		const noOverride = materialized(
			materializeInstance(
				"i",
				instance({
					definitionId: "d",
					variantSelection: { size: "lg" },
					propOverrides: { "p-label": "exposed" },
				}),
				{ d: base },
			),
		);
		expect(noOverride.node.props.label).toBe("exposed");

		const noProps = materialized(
			materializeInstance(
				"i",
				instance({ definitionId: "d", variantSelection: { size: "lg" } }),
				{ d: base },
			),
		);
		expect(noProps.node.props.label).toBe("variant");

		const bare = materialized(
			materializeInstance("i", instance({ definitionId: "d" }), { d: base }),
		);
		expect(bare.node.props.label).toBe("base");
	});

	it("applies an exposed default when the instance sets nothing", () => {
		const withDefault = definition({
			id: "d2",
			root: { type: "Box", props: { id: "n" } },
			exposedProps: [
				{
					id: "p",
					name: "P",
					type: "text",
					sourcePath: ["label"],
					defaultValue: "fallback",
				},
			],
		});
		const result = materialized(
			materializeInstance("i", instance({ definitionId: "d2" }), {
				d2: withDefault,
			}),
		);
		expect(result.node.props.label).toBe("fallback");
	});

	it("writes exposed props at a nested source path", () => {
		const nestedPath = definition({
			id: "d3",
			root: { type: "Box", props: { id: "n", style: { color: "red" } } },
			exposedProps: [
				{ id: "p", name: "P", type: "text", sourcePath: ["style", "color"] },
			],
		});
		const result = materialized(
			materializeInstance(
				"i",
				instance({ definitionId: "d3", propOverrides: { p: "blue" } }),
				{ d3: nestedPath },
			),
		);
		expect(result.node.props.style).toEqual({ color: "blue" });
	});

	it("surfaces authoring families from overrides under the runtime id", () => {
		const result = materialized(
			materializeInstance(
				"i",
				instance({
					definitionId: "d",
					nodeOverrides: { "n-root": { layout: { base: { gap: px(4) } } } },
				}),
				{ d: base },
			),
		);
		expect(result.authoring["i::n-root"]).toEqual({
			layout: { base: { gap: px(4) } },
		});
	});
});

describe("cycles and depth (§24.4)", () => {
	/** `parent` nests an instance of `child` at definition node `n-slot`. */
	const nesting = (id: string, childDefinitionId: string) =>
		definition({
			id,
			name: id,
			root: {
				type: "Box",
				props: {
					id: `${id}-root`,
					children: [
						{
							type: "Box",
							props: {
								id: `${id}-slot`,
								[CANONICAL_COMPONENT_INSTANCE_PROP]: {
									definitionId: childDefinitionId,
									definitionRevision: 1,
									variantSelection: {},
									propOverrides: {},
									nodeOverrides: {},
								},
							},
						},
					],
				},
			} as unknown as SerializablePuckNode,
		});

	it("materializes a nested instance", () => {
		const definitions = {
			Card: nesting("Card", "Badge"),
			Badge: definition({ id: "Badge", name: "Badge" }),
		};
		const result = materialized(
			materializeInstance("i", instance({ definitionId: "Card" }), definitions),
		);
		const child = (
			result.node.props.children as unknown as SerializablePuckNode[]
		)[0];
		expect(child?.type).toBe("Box");
		// The nested instance resolved to Badge's root.
		expect(String(child?.props.id)).toContain("::n-root");
	});

	it("detects a direct cycle with the full path", () => {
		const definitions = {
			Card: nesting("Card", "Card"),
		};
		const result = materializeInstance(
			"i",
			instance({ definitionId: "Card" }),
			definitions,
		);
		expect(result.status).toBe("cycle");
		if (result.status === "cycle") {
			expect(formatComponentPath(result.path, definitions)).toBe("Card → Card");
		}
	});

	it("detects an indirect cycle with the full path", () => {
		const definitions = {
			Card: nesting("Card", "Badge"),
			Badge: nesting("Badge", "Card"),
		};
		const result = materializeInstance(
			"i",
			instance({ definitionId: "Card" }),
			definitions,
		);
		expect(result.status).toBe("cycle");
		if (result.status === "cycle") {
			expect(formatComponentPath(result.path, definitions)).toBe(
				"Card → Badge → Card",
			);
		}
	});

	it("caps nesting depth at the frozen limit", () => {
		const definitions: Record<string, ComponentDefinition> = {};
		for (let index = 0; index < 14; index += 1) {
			definitions[`d${index}`] = nesting(`d${index}`, `d${index + 1}`);
		}
		definitions.d14 = definition({ id: "d14", name: "d14" });
		const result = materializeInstance(
			"i",
			instance({ definitionId: "d0" }),
			definitions,
		);
		expect(result.status).toBe("depth-exceeded");
	});

	it("reports a missing definition", () => {
		expect(
			materializeInstance("i", instance({ definitionId: "gone" }), {}).status,
		).toBe("missing-definition");
	});

	it("propagates a nested failure rather than emitting a partial tree", () => {
		const definitions = { Card: nesting("Card", "Missing") };
		const result = materializeInstance(
			"i",
			instance({ definitionId: "Card" }),
			definitions,
		);
		expect(result.status).toBe("missing-definition");
	});
});

describe("purity", () => {
	it("never mutates its inputs and is deterministic", () => {
		const definitions = {
			d: definition({
				id: "d",
				root: { type: "Box", props: { id: "n", label: "base" } },
			}),
		};
		const snapshot = JSON.parse(JSON.stringify(definitions));
		const state = instance({
			definitionId: "d",
			nodeOverrides: { n: { props: { label: "x" } } },
		});
		const first = materializeInstance("i", state, definitions);
		const second = materializeInstance("i", state, definitions);
		expect(definitions).toEqual(snapshot);
		expect(first).toEqual(second);
	});
});
