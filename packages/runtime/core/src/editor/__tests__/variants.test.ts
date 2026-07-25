/**
 * Variant axis/combination contracts and the patch resolver
 * (PLAN-0020 CORE-P2-009A/B; ED-VARIANT-001; DD-0019 §14.2, §14.4,
 * §24.4; DD-DEC-009).
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	ComponentVariant,
	EditorCommandBase,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	createEmptyAuthoringState,
	matchVariant,
	materializeInstance,
	validateAtomicCommand,
	validateVariantModel,
	variantCombinationCount,
	variantCombinationKey,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `var-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const axis = (id: string, options: readonly string[]): VariantAxis => ({
	id,
	name: id,
	options: options.map((option) => ({ id: option, name: option })),
});

const variant = (
	id: string,
	selection: Record<string, string>,
	label = id,
): ComponentVariant => ({
	id,
	selection,
	patch: { "n-root": { props: { label } } },
});

function definition(
	axes: readonly VariantAxis[],
	variants: readonly ComponentVariant[],
): ComponentDefinitionV1 {
	return {
		version: "1",
		id: "def",
		name: "Card",
		root: { type: "Box", props: { id: "n-root", label: "base" } },
		exposedProps: [],
		variantAxes: axes,
		variants,
		revision: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

const SIZE = axis("size", ["sm", "lg"]);
const TONE = axis("tone", ["light", "dark"]);

function docWith(def: ComponentDefinitionV1): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		componentDefinitions: { def },
		nodes: {
			i1: {
				version: "1",
				componentInstance: {
					definitionId: "def",
					definitionRevision: 1,
					variantSelection: {},
					propOverrides: {},
					nodeOverrides: {},
				},
			},
		},
	};
}

const reasons = (errors: readonly { details?: Record<string, unknown> }[]) =>
	errors.map((error) => error.details?.reason);

describe("combination helpers", () => {
	it("keys a selection independently of property order", () => {
		expect(variantCombinationKey({ size: "sm", tone: "dark" })).toBe(
			variantCombinationKey({ tone: "dark", size: "sm" }),
		);
	});

	it("counts expressible combinations as the product of options", () => {
		expect(variantCombinationCount([SIZE, TONE])).toBe(4);
		expect(variantCombinationCount([])).toBe(1);
	});
});

describe("validateVariantModel (CORE-P2-009A)", () => {
	it("accepts a complete, unambiguous model", () => {
		const def = definition(
			[SIZE, TONE],
			[
				variant("v1", { size: "sm", tone: "light" }),
				variant("v2", { size: "lg", tone: "dark" }),
			],
		);
		expect(validateVariantModel(def)).toEqual([]);
	});

	it("rejects duplicate axis ids", () => {
		const def = definition([SIZE, axis("size", ["x"])], []);
		expect(reasons(validateVariantModel(def))).toContain("duplicate-id");
	});

	it("rejects duplicate option ids within an axis", () => {
		const def = definition([axis("size", ["sm", "sm"])], []);
		const errors = validateVariantModel(def);
		expect(
			errors.some((error) => error.details?.kind === "variantAxisOption"),
		).toBe(true);
	});

	it("rejects a variant selecting an unknown axis", () => {
		const def = definition([SIZE], [variant("v1", { ghost: "x" })]);
		expect(
			validateVariantModel(def).some(
				(error) => error.details?.kind === "variantAxis",
			),
		).toBe(true);
	});

	it("rejects a variant selecting an undeclared option", () => {
		const def = definition([SIZE], [variant("v1", { size: "xl" })]);
		const errors = validateVariantModel(def);
		expect(errors.map((error) => error.code)).toContain(
			"EDITOR_NODE_NOT_FOUND",
		);
		expect(errors.some((error) => error.details?.optionId === "xl")).toBe(true);
	});

	it("rejects an incomplete selection", () => {
		// A partial selection matches nothing and silently renders base —
		// exactly the ambiguity the contract's "full axis selection" rules out.
		const def = definition([SIZE, TONE], [variant("v1", { size: "sm" })]);
		expect(reasons(validateVariantModel(def))).toContain(
			"incomplete-selection",
		);
	});

	it("rejects duplicate variant ids", () => {
		const def = definition(
			[SIZE],
			[variant("v1", { size: "sm" }), variant("v1", { size: "lg" })],
		);
		expect(reasons(validateVariantModel(def))).toContain("duplicate-id");
	});

	it("rejects two variants declaring the same combination", () => {
		// Duplicates would make matching order-dependent.
		const def = definition(
			[SIZE],
			[variant("v1", { size: "sm" }), variant("v2", { size: "sm" })],
		);
		expect(reasons(validateVariantModel(def))).toContain(
			"duplicate-combination",
		);
	});

	it("enforces the ≤3 axis cap", () => {
		const def = definition(
			[axis("a", ["x"]), axis("b", ["x"]), axis("c", ["x"]), axis("d", ["x"])],
			[],
		);
		const errors = validateVariantModel(def);
		expect(errors.map((error) => error.code)).toContain(
			"EDITOR_LIMIT_EXCEEDED",
		);
		expect(
			errors.some(
				(error) => error.details?.limitKey === "variantAxesPerComponent",
			),
		).toBe(true);
	});

	it("enforces the ≤20 combination cap", () => {
		const many = Array.from({ length: 21 }, (_, index) =>
			variant(`v${index}`, { size: index % 2 === 0 ? "sm" : "lg" }),
		);
		const errors = validateVariantModel(definition([SIZE], many));
		expect(
			errors.some(
				(error) => error.details?.limitKey === "variantsPerComponent",
			),
		).toBe(true);
	});
});

describe("matchVariant — deterministic combination matching (009B)", () => {
	const def = definition(
		[SIZE, TONE],
		[
			variant("v1", { size: "sm", tone: "light" }),
			variant("v2", { size: "lg", tone: "dark" }),
		],
	);

	it("matches an exact full selection", () => {
		expect(matchVariant(def, { size: "lg", tone: "dark" })?.id).toBe("v2");
	});

	it("matches nothing for a partial selection", () => {
		expect(matchVariant(def, { size: "lg" })).toBeUndefined();
	});

	it("matches nothing for an undeclared combination", () => {
		expect(matchVariant(def, { size: "sm", tone: "dark" })).toBeUndefined();
	});

	it("returns undefined when the component has no axes", () => {
		expect(matchVariant(definition([], []), {})).toBeUndefined();
	});

	it("is order-independent across selection key order", () => {
		expect(matchVariant(def, { size: "lg", tone: "dark" })?.id).toBe(
			matchVariant(def, { tone: "dark", size: "lg" })?.id,
		);
	});

	it("is order-independent across variant array order", () => {
		const reversed = definition([SIZE, TONE], [...def.variants].reverse());
		expect(matchVariant(reversed, { size: "lg", tone: "dark" })?.id).toBe("v2");
	});

	it("is pure and deterministic", () => {
		const snapshot = JSON.parse(JSON.stringify(def));
		const first = matchVariant(def, { size: "sm", tone: "light" });
		const second = matchVariant(def, { size: "sm", tone: "light" });
		expect(first).toEqual(second);
		expect(def).toEqual(snapshot);
	});
});

describe("variant patch at its §24.4 position (009B)", () => {
	const def = definition(
		[SIZE],
		[variant("v-lg", { size: "lg" }, "from-variant")],
	);

	it("applies the matched variant's patch over the base", () => {
		const state = docWith(def);
		const result = materializeInstance(
			"i1",
			{
				...state.nodes.i1!.componentInstance!,
				variantSelection: { size: "lg" },
			},
			state.componentDefinitions,
		);
		expect(result.status).toBe("materialized");
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("from-variant");
		}
	});

	it("renders the base when nothing matches", () => {
		const state = docWith(def);
		const result = materializeInstance(
			"i1",
			{
				...state.nodes.i1!.componentInstance!,
				variantSelection: { size: "sm" },
			},
			state.componentDefinitions,
		);
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("base");
		}
	});

	it("stays below exposed props and node overrides", () => {
		const withExposed: ComponentDefinitionV1 = {
			...def,
			exposedProps: [
				{ id: "p", name: "P", type: "text", sourcePath: ["label"] },
			],
		};
		const state = docWith(withExposed);
		const result = materializeInstance(
			"i1",
			{
				...state.nodes.i1!.componentInstance!,
				variantSelection: { size: "lg" },
				propOverrides: { p: "from-exposed" },
			},
			state.componentDefinitions,
		);
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("from-exposed");
		}
	});
});

describe("component.definition.update (CORE-P2-009A)", () => {
	it("writes the variant model and bumps the revision", () => {
		const state = docWith(definition([], []));
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.definition.update",
			definitionId: "def",
			patch: {
				variantAxes: [SIZE],
				variants: [variant("v1", { size: "sm" })],
			} as never,
		});
		expect(result.status).toBe("changed");
		const next = result.state.componentDefinitions.def;
		expect(next?.variantAxes).toHaveLength(1);
		// Propagation is observable to instances holding definitionRevision.
		expect(next?.revision).toBe(2);
		expect(next?.updatedAt).toBe(new Date(1_750_000_000_000).toISOString());
	});

	it("rejects a patch producing an ambiguous model", () => {
		const state = docWith(definition([], []));
		const errors = validateAtomicCommand(state, {
			...base(state.revision),
			type: "component.definition.update",
			definitionId: "def",
			patch: {
				variantAxes: [SIZE],
				variants: [
					variant("v1", { size: "sm" }),
					variant("v2", { size: "sm" }),
				],
			} as never,
		});
		expect(reasons(errors)).toContain("duplicate-combination");
	});

	it("rejects an unknown definition", () => {
		const state = docWith(definition([], []));
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.definition.update",
				definitionId: "ghost",
				patch: { name: "x" },
			}).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_UNAVAILABLE");
	});

	it("never lets a caller forge id, version, or revision", () => {
		const state = docWith(definition([], []));
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.definition.update",
			definitionId: "def",
			patch: {
				id: "hijack",
				version: "9",
				revision: 99,
				name: "Renamed",
			} as never,
		});
		const next = result.state.componentDefinitions.def;
		expect(next?.id).toBe("def");
		expect(next?.version).toBe("1");
		expect(next?.revision).toBe(2);
		expect(next?.name).toBe("Renamed");
	});
});
