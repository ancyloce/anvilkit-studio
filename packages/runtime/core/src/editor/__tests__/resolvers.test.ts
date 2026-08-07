/**
 * §27.4 responsive/merge/token/node resolution matrix
 * (PLAN-0020 CORE-P0-010).
 */

import type {
	BreakpointDefinition,
	DesignToken,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	createEmptyAuthoringState,
	getMatchingBreakpoints,
	mergePropertyWise,
	resolveResponsiveValue,
	resolveTargetAppearance,
	resolveToken,
} from "../index.js";
import type { AuthoringStateV1 } from "../legacy/index.js";
import { targetFromRecord } from "../style/export-stylesheet.js";

const breakpoints: readonly BreakpointDefinition[] = [
	{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
	{ id: "mobile", label: "Mobile", maxWidth: 767, order: 1, enabled: true },
	{ id: "off", label: "Off", maxWidth: 480, order: 2, enabled: false },
];

const replace = <T>(_base: T | undefined, override: T): T => override;

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

describe("getMatchingBreakpoints", () => {
	it("matches enabled breakpoints with w <= maxWidth, widest first", () => {
		expect(getMatchingBreakpoints(breakpoints, 800).map((b) => b.id)).toEqual([
			"tablet",
		]);
		expect(getMatchingBreakpoints(breakpoints, 700).map((b) => b.id)).toEqual([
			"tablet",
			"mobile",
		]);
		expect(getMatchingBreakpoints(breakpoints, 1200)).toEqual([]);
		// Disabled breakpoints never match.
		expect(getMatchingBreakpoints(breakpoints, 400).map((b) => b.id)).toEqual([
			"tablet",
			"mobile",
		]);
	});
});

describe("resolveResponsiveValue (§12.3 matrix)", () => {
	const cases: ReadonlyArray<{
		readonly name: string;
		readonly input: ResponsiveValue<number> | undefined;
		readonly width: number;
		readonly value: number | undefined;
		readonly source: string;
		readonly inherited: boolean;
	}> = [
		{
			name: "undefined input resolves to default",
			input: undefined,
			width: 700,
			value: undefined,
			source: "default",
			inherited: false,
		},
		{
			name: "base only at desktop",
			input: { base: 1 },
			width: 1200,
			value: 1,
			source: "base",
			inherited: false,
		},
		{
			name: "base inherited at mobile",
			input: { base: 1 },
			width: 700,
			value: 1,
			source: "base",
			inherited: true,
		},
		{
			name: "narrowest match wins",
			input: { base: 1, overrides: { tablet: 2, mobile: 3 } },
			width: 700,
			value: 3,
			source: "mobile",
			inherited: false,
		},
		{
			name: "wider override inherited below",
			input: { base: 1, overrides: { tablet: 2 } },
			width: 700,
			value: 2,
			source: "tablet",
			inherited: true,
		},
		{
			name: "null override resumes inheritance",
			input: { base: 1, overrides: { tablet: 2, mobile: null } },
			width: 700,
			value: 2,
			source: "tablet",
			inherited: true,
		},
		{
			name: "no base, only override",
			input: { overrides: { tablet: 2 } },
			width: 900,
			value: 2,
			source: "tablet",
			inherited: false,
		},
		{
			name: "override above viewport does not apply",
			input: { base: 1, overrides: { mobile: 3 } },
			width: 900,
			value: 1,
			source: "base",
			inherited: true,
		},
	];

	for (const testCase of cases) {
		it(testCase.name, () => {
			const resolved = resolveResponsiveValue(
				testCase.input,
				breakpoints,
				testCase.width,
				replace,
			);
			expect(resolved.value).toBe(testCase.value);
			expect(resolved.source).toBe(testCase.source);
			expect(resolved.inherited).toBe(testCase.inherited);
		});
	}
});

describe("mergePropertyWise", () => {
	it("merges property-wise without erasing unrelated lower values", () => {
		const merged = mergePropertyWise<Record<string, unknown>>(
			{ display: "flex", gap: px(24), padding: { top: px(8), left: px(4) } },
			{ padding: { top: px(16) } },
		);
		expect(merged).toEqual({
			display: "flex",
			gap: px(24),
			padding: { top: px(16), left: px(4) },
		});
	});

	it("replaces typed values and arrays wholesale", () => {
		const merged = mergePropertyWise<Record<string, unknown>>(
			{ gap: px(24), shadows: [1, 2] },
			{ gap: px(8), shadows: [3] },
		);
		expect(merged).toEqual({ gap: px(8), shadows: [3] });
	});

	it("skips undefined and null layers and is associative", () => {
		const a = { x: 1 };
		const b = { y: 2 };
		const c = { x: 3, z: 4 };
		const leftFold = mergePropertyWise<Record<string, unknown>>(
			mergePropertyWise<Record<string, unknown>>(a, b),
			c,
		);
		const rightFold = mergePropertyWise<Record<string, unknown>>(
			a,
			mergePropertyWise<Record<string, unknown>>(b, c),
		);
		expect(leftFold).toEqual(rightFold);
		expect(
			mergePropertyWise<Record<string, unknown>>(undefined, a, null, b),
		).toEqual({ x: 1, y: 2 });
	});
});

describe("resolveToken (§24.5)", () => {
	const tokens: Record<string, DesignToken> = {
		direct: {
			id: "direct",
			path: ["p"],
			name: "Direct",
			type: "color",
			values: { light: { kind: "literal", value: "#111111" } },
		},
		alias: {
			id: "alias",
			path: ["p"],
			name: "Alias",
			type: "color",
			values: { light: { kind: "alias", tokenId: "direct" } },
		},
		loopA: {
			id: "loopA",
			path: ["p"],
			name: "LoopA",
			type: "color",
			values: { light: { kind: "alias", tokenId: "loopB" } },
		},
		loopB: {
			id: "loopB",
			path: ["p"],
			name: "LoopB",
			type: "color",
			values: { light: { kind: "alias", tokenId: "loopA" } },
		},
	};
	const modes = { light: { id: "light", name: "Light" } };

	it("resolves literals and alias chains", () => {
		expect(resolveToken("direct", "light", tokens, modes)).toEqual({
			status: "resolved",
			modeId: "light",
			value: "#111111",
			type: "color",
			tokenId: "direct",
		});
		const viaAlias = resolveToken("alias", "light", tokens, modes);
		expect(viaAlias.status).toBe("resolved");
		if (viaAlias.status === "resolved") {
			expect(viaAlias.tokenId).toBe("direct");
		}
	});

	it("detects cycles instead of recursing forever", () => {
		expect(resolveToken("loopA", "light", tokens, modes).status).toBe("cycle");
	});

	it("bounds alias depth at the frozen limit", () => {
		const chain: Record<string, DesignToken> = {};
		for (let index = 0; index < 12; index += 1) {
			chain[`t${index}`] = {
				id: `t${index}`,
				path: ["p"],
				name: `T${index}`,
				type: "number",
				values: {
					light:
						index === 11
							? { kind: "literal", value: index }
							: { kind: "alias", tokenId: `t${index + 1}` },
				},
			};
		}
		expect(resolveToken("t0", "light", chain, modes).status).toBe("cycle");
	});

	it("reports missing tokens and missing mode values", () => {
		expect(resolveToken("ghost", "light", tokens, modes).status).toBe(
			"missing-token",
		);
		expect(resolveToken("direct", "dark", tokens, modes).status).toBe(
			"missing-value",
		);
	});
});

describe("resolveTargetAppearance (§24.3 precedence)", () => {
	function makeState(): AuthoringStateV1 {
		return {
			...createEmptyAuthoringState(),
			breakpoints: [...breakpoints],
			nodes: {
				n1: {
					version: "1",
					layout: {
						base: { gap: px(24), display: "flex" },
						overrides: { tablet: { gap: px(12) } },
					},
					typography: {
						base: { color: { kind: "token", tokenId: "text" } },
					},
					styleRefs: { base: ["sd"] },
					hidden: { overrides: { mobile: true } },
				},
			},
			tokens: {
				text: {
					id: "text",
					path: ["c"],
					name: "Text",
					type: "color",
					values: {
						light: {
							kind: "literal",
							value: { kind: "hex", value: "#222222" },
						},
					},
				},
			},
			tokenModes: { light: { id: "light", name: "Light" } },
			styleDefinitions: {
				sd: {
					version: "1",
					id: "sd",
					name: "Card",
					appliesTo: "any",
					layout: {
						base: { padding: { top: px(4) } },
						overrides: { tablet: { padding: { top: px(2) } } },
					},
					createdAt: "2026-07-22T00:00:00.000Z",
					updatedAt: "2026-07-22T00:00:00.000Z",
				},
			},
		};
	}

	it("applies default < styleDef < node base < styleDef bp < node bp", () => {
		const state = makeState();
		const resolved = resolveTargetAppearance(targetFromRecord(state.nodes.n1), {
			designSystem: state,
			breakpoints,
			viewportWidth: 900,
			tokenMode: "light",
			componentDefaults: { layout: { gap: px(99), minWidth: px(10) } },
		});
		expect(resolved.layout).toEqual({
			display: "flex",
			gap: px(12),
			minWidth: px(10),
			padding: { top: px(2) },
		});
		expect(resolved.hidden).toBe(false);
		expect(resolved.diagnostics).toEqual([]);
	});

	it("substitutes tokens after precedence selection", () => {
		const state = makeState();
		const resolved = resolveTargetAppearance(targetFromRecord(state.nodes.n1), {
			designSystem: state,
			breakpoints,
			viewportWidth: 1200,
			tokenMode: "light",
		});
		expect(resolved.typography.color).toEqual({
			kind: "literal",
			value: { kind: "hex", value: "#222222" },
		});
	});

	it("keeps unresolved token refs and reports diagnostics", () => {
		const state = makeState();
		const broken: AuthoringStateV1 = { ...state, tokens: {} };
		const resolved = resolveTargetAppearance(
			targetFromRecord(broken.nodes.n1),
			{
				designSystem: broken,
				breakpoints,
				viewportWidth: 1200,
				tokenMode: "light",
			},
		);
		expect(resolved.typography.color).toEqual({
			kind: "token",
			tokenId: "text",
		});
		expect(resolved.diagnostics.some((d) => d.severity === "warning")).toBe(
			true,
		);
	});

	it("resolves hidden responsively and flags missing style definitions", () => {
		const state = makeState();
		const resolved = resolveTargetAppearance(targetFromRecord(state.nodes.n1), {
			designSystem: state,
			breakpoints,
			viewportWidth: 700,
			tokenMode: "light",
		});
		expect(resolved.hidden).toBe(true);

		const withGhostRef: AuthoringStateV1 = {
			...state,
			nodes: {
				n1: {
					...state.nodes.n1,
					version: "1",
					styleRefs: { base: ["ghost"] },
				},
			},
		};
		const flagged = resolveTargetAppearance(
			targetFromRecord(withGhostRef.nodes.n1),
			{
				designSystem: withGhostRef,
				breakpoints,
				viewportWidth: 700,
				tokenMode: "light",
			},
		);
		expect(flagged.diagnostics[0]?.details?.kind).toBe("styleDefinition");
	});

	it("resolves an unknown node to pure defaults", () => {
		const state = makeState();
		const resolved = resolveTargetAppearance(
			targetFromRecord(state.nodes.ghost),
			{
				designSystem: state,
				breakpoints,
				viewportWidth: 1200,
				tokenMode: "light",
			},
		);
		expect(resolved.layout).toEqual({});
		expect(resolved.hidden).toBe(false);
	});
});
