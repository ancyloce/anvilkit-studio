/**
 * @file P2-03 — v2 appearance prop-read tests: single selection,
 * multi-selection mixed state, breakpoint layers with clear semantics,
 * provenance, capability gating, slot traversal, and the shared
 * borderRadius/boxShadow vocabulary translation.
 */

import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	collectAppearanceNodes,
	documentBreakpoints,
	readAppearanceProperty,
	readTargetHidden,
	readTargetStyleRefs,
	type TargetReadInput,
} from "../read-appearance.js";

const config: Config = {
	components: {
		Box: {
			fields: { body: { type: "slot" } },
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: {
								label: "Box",
								responsive: true,
								properties: ["display", "gap", "opacity", "borderRadius"],
							},
						},
					},
				},
			},
			render: () => null,
		},
		Plain: { fields: {}, render: () => null },
	},
} as unknown as Config;

const breakpointRow = {
	id: "bp-sm",
	label: "Small",
	maxWidth: 640,
	order: 0,
	enabled: true,
};

function appearanceWith(
	style: Record<string, unknown>,
	rest: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		version: "1",
		targets: { root: { style, ...rest } },
	};
}

function docWith(
	nodes: readonly { id: string; type?: string; appearance?: unknown }[],
): Data {
	return {
		content: nodes.map((node) => ({
			type: node.type ?? "Box",
			props: {
				id: node.id,
				...(node.appearance !== undefined
					? { appearance: node.appearance }
					: {}),
			},
		})),
		root: {
			props: {
				designSystem: {
					version: "1",
					breakpoints: [breakpointRow],
					tokens: {},
					tokenModes: { light: { id: "light", name: "Light" } },
					defaultTokenMode: "light",
					styleDefinitions: {},
				},
			},
		},
		zones: {},
	} as unknown as Data;
}

function inputFor(
	data: Data,
	nodeIds: readonly string[],
	layer: "base" | string = "base",
): TargetReadInput {
	return {
		nodes: collectAppearanceNodes(data, config),
		config,
		breakpoints: documentBreakpoints(data),
		nodeIds,
		targetId: "root",
		layer,
	};
}

describe("readAppearanceProperty (P2-03)", () => {
	it("reads a written base value for a single selection with provenance", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith({ base: { layout: { display: "flex" } } }),
			},
		]);
		const read = readAppearanceProperty({
			...inputFor(data, ["a"]),
			property: "display",
		});
		expect(read).toMatchObject({
			kind: "value",
			value: "flex",
			writtenAtLayer: true,
		});
	});

	it("agreeing multi-selection reads value; disagreeing reads mixed", () => {
		const flex = appearanceWith({ base: { layout: { display: "flex" } } });
		const grid = appearanceWith({ base: { layout: { display: "grid" } } });
		const agree = docWith([
			{ id: "a", appearance: flex },
			{ id: "b", appearance: flex },
		]);
		const disagree = docWith([
			{ id: "a", appearance: flex },
			{ id: "b", appearance: grid },
		]);
		expect(
			readAppearanceProperty({
				...inputFor(agree, ["a", "b"]),
				property: "display",
			}),
		).toMatchObject({ kind: "value", value: "flex" });
		expect(
			readAppearanceProperty({
				...inputFor(disagree, ["a", "b"]),
				property: "display",
			}),
		).toEqual({ kind: "mixed" });
	});

	it("breakpoint layer: written override reads written; absent falls back to base as inherited", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith({
					base: { layout: { display: "flex" } },
					overrides: { "bp-sm": { layout: { display: "block" } } },
				}),
			},
			{
				id: "b",
				appearance: appearanceWith({ base: { layout: { display: "flex" } } }),
			},
		]);
		const overridden = readAppearanceProperty({
			...inputFor(data, ["a"], "bp-sm"),
			property: "display",
		});
		expect(overridden).toMatchObject({
			kind: "value",
			value: "block",
			writtenAtLayer: true,
		});
		const inherited = readAppearanceProperty({
			...inputFor(data, ["b"], "bp-sm"),
			property: "display",
		});
		expect(inherited).toMatchObject({
			kind: "value",
			value: "flex",
			writtenAtLayer: false,
		});
	});

	it("a cleared (null) breakpoint layer reads as not written and falls back", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith({
					base: { layout: { display: "flex" } },
					overrides: { "bp-sm": null },
				}),
			},
		]);
		const read = readAppearanceProperty({
			...inputFor(data, ["a"], "bp-sm"),
			property: "display",
		});
		expect(read).toMatchObject({
			kind: "value",
			value: "flex",
			writtenAtLayer: false,
		});
	});

	it("borderRadius reads the authored `radius` spec key (shared vocabulary)", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith({
					base: {
						visual: {
							radius: { topLeft: { kind: "unit", value: 8, unit: "px" } },
						},
					},
				}),
			},
		]);
		const read = readAppearanceProperty({
			...inputFor(data, ["a"]),
			property: "borderRadius",
		});
		expect(read.kind).toBe("value");
	});

	it("ungranted property and undeclared component read unsupported", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith({
					base: { layout: { gap: { kind: "unit", value: 4, unit: "px" } } },
				}),
			},
			{ id: "p", type: "Plain" },
		]);
		// `padding` is not granted on Box's root target.
		expect(
			readAppearanceProperty({
				...inputFor(data, ["a"]),
				property: "padding",
			}),
		).toEqual({ kind: "unsupported" });
		// Plain declares no metadata v2 at all.
		expect(
			readAppearanceProperty({
				...inputFor(data, ["p"]),
				property: "display",
			}),
		).toEqual({ kind: "unsupported" });
		// Mixed-capability selection: only the capable node participates.
		expect(
			readAppearanceProperty({
				...inputFor(data, ["a", "p"]),
				property: "gap",
			}),
		).toMatchObject({ kind: "value" });
	});

	it("nothing authored anywhere reads unset with a resolved fallback", () => {
		const data = docWith([{ id: "a" }]);
		const read = readAppearanceProperty({
			...inputFor(data, ["a"]),
			property: "display",
		});
		expect(read.kind).toBe("unset");
	});

	it("finds nodes nested in slots through walkTree", () => {
		const data = {
			content: [
				{
					type: "Box",
					props: {
						id: "outer",
						body: [
							{
								type: "Box",
								props: {
									id: "inner",
									appearance: appearanceWith({
										base: { layout: { display: "grid" } },
									}),
								},
							},
						],
					},
				},
			],
			root: { props: {} },
			zones: {},
		} as unknown as Data;
		const read = readAppearanceProperty({
			nodes: collectAppearanceNodes(data, config),
			config,
			breakpoints: [],
			nodeIds: ["inner"],
			targetId: "root",
			layer: "base",
			property: "display",
		});
		expect(read).toMatchObject({ kind: "value", value: "grid" });
	});
});

describe("readTargetHidden / readTargetStyleRefs (P2-03)", () => {
	it("reads hidden and styleRefs layers with mixed detection", () => {
		const data = docWith([
			{
				id: "a",
				appearance: appearanceWith(
					{},
					{
						hidden: { base: true },
						styleRefs: { base: ["card", "spacious"] },
					},
				),
			},
			{
				id: "b",
				appearance: appearanceWith(
					{},
					{
						hidden: { base: false },
						styleRefs: { base: ["card", "spacious"] },
					},
				),
			},
		]);
		expect(readTargetHidden(inputFor(data, ["a"]))).toMatchObject({
			kind: "value",
			value: true,
			writtenAtLayer: true,
		});
		expect(readTargetHidden(inputFor(data, ["a", "b"]))).toEqual({
			kind: "mixed",
		});
		expect(readTargetStyleRefs(inputFor(data, ["a", "b"]))).toMatchObject({
			kind: "value",
			value: ["card", "spacious"],
		});
	});
});
