/**
 * §27.4 responsive/merge/token/node resolution matrix
 * (PLAN-0020 CORE-P0-010).
 */

import type {
	AuthorStyle,
	BreakpointDefinition,
	DesignToken,
	EditorError,
	ResponsiveValue,
	StyleDefinition,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	getMatchingBreakpoints,
	materializeTokenLiteral,
	mergePropertyWise,
	resolveResponsiveValue,
	resolveTargetAppearance,
	resolveToken,
	substituteTokens,
} from "../index.js";

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

	it("skips explicitly-undefined properties instead of erasing them", () => {
		// `Object.entries` yields own properties whose value is
		// `undefined`, so an override written as `{gap: undefined}` — what
		// a field clear produces before normalization — must read as "no
		// contribution", not as "erase the lower layer's gap".
		expect(
			mergePropertyWise<Record<string, unknown>>(
				{ gap: px(24), padding: { top: px(8) } },
				{ gap: undefined, display: "flex", padding: { top: undefined } },
			),
		).toEqual({ gap: px(24), display: "flex", padding: { top: px(8) } });
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
		darkOnly: {
			id: "darkOnly",
			path: ["p"],
			name: "Dark only",
			type: "color",
			values: { dark: { kind: "literal", value: "#222222" } },
		},
		gutter: {
			id: "gutter",
			path: ["p"],
			name: "Gutter",
			type: "length",
			values: { light: { kind: "literal", value: px(4) } },
		},
		crossType: {
			id: "crossType",
			path: ["p"],
			name: "Cross type",
			type: "color",
			values: { light: { kind: "alias", tokenId: "gutter" } },
		},
		dangling: {
			id: "dangling",
			path: ["p"],
			name: "Dangling",
			type: "color",
			values: { light: { kind: "alias", tokenId: "ghost" } },
		},
	};
	const modes = {
		light: { id: "light", name: "Light" },
		dark: { id: "dark", name: "Dark" },
	};

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

	it("falls back to the default mode and reports the mode it read (§15.1)", () => {
		const resolved = resolveToken("darkOnly", "light", tokens, modes, {
			defaultModeId: "dark",
		});
		expect(resolved).toEqual({
			status: "resolved",
			value: "#222222",
			type: "color",
			tokenId: "darkOnly",
			modeId: "dark",
		});
	});

	it("does not fall back when the default mode is the requested mode", () => {
		expect(
			resolveToken("darkOnly", "light", tokens, modes, {
				defaultModeId: "light",
			}).status,
		).toBe("missing-value");
		// Nor when the fallback mode carries no value either.
		expect(
			resolveToken("direct", "dark", tokens, modes, {
				defaultModeId: "sepia",
			}).status,
		).toBe("missing-value");
	});

	it("rejects an alias to a token of an incompatible type", () => {
		expect(resolveToken("crossType", "light", tokens, modes)).toEqual({
			status: "type-mismatch",
			tokenId: "crossType",
			aliasTokenId: "gutter",
			expected: "color",
			actual: "length",
		});
	});

	it("reports a dangling alias as a missing token, not a mismatch", () => {
		expect(resolveToken("dangling", "light", tokens, modes)).toEqual({
			status: "missing-token",
			tokenId: "ghost",
		});
	});
});

describe("materializeTokenLiteral", () => {
	it("returns length-valued types raw and wraps every other type", () => {
		// `CssLength` has no `"literal"` member, so wrapping a length would
		// fall through `serializeCssLength` and drop the property silently.
		expect(materializeTokenLiteral("length", px(4))).toEqual(px(4));
		expect(materializeTokenLiteral("radius", px(2))).toEqual(px(2));
		expect(materializeTokenLiteral("color", "#111111")).toEqual({
			kind: "literal",
			value: "#111111",
		});
		expect(materializeTokenLiteral("number", 1.5)).toEqual({
			kind: "literal",
			value: 1.5,
		});
	});
});

/**
 * `resolve/node.ts` lost its suite wholesale when the legacy authoring
 * sidecar was deleted: the old cases were written against
 * `AuthoringStateV1` and `targetFromRecord`, both of which went with
 * it. The cascade itself survived, re-signatured to read a
 * `TargetAppearance` directly (PLAN-0026 §3.2 `p2-002`), so these
 * rebuild the §24.3 matrix on the current contract — no legacy types.
 */
const nodeTokens: Record<string, DesignToken> = {
	brand: {
		id: "brand",
		path: ["color"],
		name: "Brand",
		type: "color",
		values: { light: { kind: "literal", value: "#00aaff" } },
	},
	space: {
		id: "space",
		path: ["space"],
		name: "Space",
		type: "length",
		values: { light: { kind: "literal", value: px(12) } },
	},
	crossType: {
		id: "crossType",
		path: ["color"],
		name: "Cross type",
		type: "color",
		values: { light: { kind: "alias", tokenId: "space" } },
	},
	cycleA: {
		id: "cycleA",
		path: ["color"],
		name: "Cycle A",
		type: "color",
		values: { light: { kind: "alias", tokenId: "cycleB" } },
	},
	cycleB: {
		id: "cycleB",
		path: ["color"],
		name: "Cycle B",
		type: "color",
		values: { light: { kind: "alias", tokenId: "cycleA" } },
	},
	darkOnly: {
		id: "darkOnly",
		path: ["color"],
		name: "Dark only",
		type: "color",
		values: { dark: { kind: "literal", value: "#222222" } },
	},
};

const nodeTokenModes = { light: { id: "light", name: "Light" } };

const substitutionContext = {
	designSystem: { tokens: nodeTokens, tokenModes: nodeTokenModes },
	tokenMode: "light",
} as const;

describe("substituteTokens (§24.5 materialization)", () => {
	it("walks arrays, objects and primitives, materializing by token type", () => {
		const diagnostics: EditorError[] = [];
		const resolved = substituteTokens(
			{
				gap: { kind: "token", tokenId: "space" },
				shadows: [{ kind: "token", tokenId: "brand" }, "inset", 3, null],
				border: { color: { kind: "token", tokenId: "brand" } },
				opacity: 0.5,
			},
			substitutionContext,
			diagnostics,
		);
		expect(resolved).toEqual({
			// A length token replaces the reference in place; every other
			// type resolves into the `{kind:"literal"}` wrapper.
			gap: px(12),
			shadows: [{ kind: "literal", value: "#00aaff" }, "inset", 3, null],
			border: { color: { kind: "literal", value: "#00aaff" } },
			opacity: 0.5,
		});
		expect(diagnostics).toEqual([]);
	});

	it("keeps the reference and warns on a cycle", () => {
		const diagnostics: EditorError[] = [];
		const ref = { kind: "token", tokenId: "cycleA" };
		expect(substituteTokens(ref, substitutionContext, diagnostics)).toEqual(
			ref,
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("EDITOR_TOKEN_CYCLE");
		expect(diagnostics[0]?.severity).toBe("warning");
	});

	it("keeps the reference and warns on an incompatible alias", () => {
		const diagnostics: EditorError[] = [];
		const ref = { kind: "token", tokenId: "crossType" };
		expect(substituteTokens(ref, substitutionContext, diagnostics)).toEqual(
			ref,
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("EDITOR_INVALID_CSS_VALUE");
		expect(diagnostics[0]?.details).toMatchObject({
			kind: "token",
			reason: "token-type-mismatch",
			tokenId: "crossType",
			aliasTokenId: "space",
			expected: "color",
			actual: "length",
		});
	});

	it("keeps the reference and warns on missing tokens and mode values", () => {
		const missingToken: EditorError[] = [];
		expect(
			substituteTokens(
				{ kind: "token", tokenId: "ghost" },
				substitutionContext,
				missingToken,
			),
		).toEqual({ kind: "token", tokenId: "ghost" });
		expect(missingToken[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
		expect(missingToken[0]?.details).toEqual({
			kind: "token",
			status: "missing-token",
		});

		const missingValue: EditorError[] = [];
		substituteTokens(
			{ kind: "token", tokenId: "darkOnly" },
			substitutionContext,
			missingValue,
		);
		expect(missingValue[0]?.details).toEqual({
			kind: "token",
			status: "missing-value",
		});
	});

	it("resolves through the fallback mode when one is configured", () => {
		const diagnostics: EditorError[] = [];
		expect(
			substituteTokens(
				{ kind: "token", tokenId: "darkOnly" },
				{ ...substitutionContext, defaultTokenMode: "dark" },
				diagnostics,
			),
		).toEqual({ kind: "literal", value: "#222222" });
		expect(diagnostics).toEqual([]);
	});
});

describe("resolveTargetAppearance (§24.3 precedence)", () => {
	const timestamps = {
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	} as const;

	const styleDefinitions: Record<string, StyleDefinition> = {
		card: {
			version: "1",
			id: "card",
			name: "Card",
			appliesTo: "any",
			layout: {
				base: { display: "flex", gap: px(4), minWidth: px(20) },
				// `null` clears the override and resumes inheritance.
				overrides: { tablet: { gap: px(8) }, mobile: null },
			},
			typography: { base: { textAlign: "left" } },
			...timestamps,
		},
		// Carries no families at all — a definition may contribute nothing.
		plain: {
			version: "1",
			id: "plain",
			name: "Plain",
			appliesTo: "any",
			...timestamps,
		},
	};

	const designSystem = {
		styleDefinitions,
		tokens: nodeTokens,
		tokenModes: nodeTokenModes,
	};

	function contextAt(viewportWidth: number) {
		return {
			designSystem,
			breakpoints,
			viewportWidth,
			tokenMode: "light",
			componentDefaults: {
				layout: { display: "block", gap: px(99), minWidth: px(2) },
			},
		} as const;
	}

	const target: TargetAppearance = {
		styleRefs: {
			base: ["card"],
			overrides: { tablet: ["card", "plain"], mobile: null },
		},
		style: {
			base: { layout: { gap: px(16) }, visual: { opacity: 0.5 } },
			overrides: { tablet: { layout: { gap: px(32) } }, mobile: null },
		},
		hidden: { base: false, overrides: { tablet: true, mobile: null } },
	};

	it("applies default < styleDef < target base < styleDef bp < target bp", () => {
		const resolved = resolveTargetAppearance(target, contextAt(900));
		expect(resolved.layout).toEqual({
			display: "flex",
			gap: px(32),
			minWidth: px(20),
		});
		expect(resolved.style).toEqual({ opacity: 0.5 });
		expect(resolved.typography).toEqual({ textAlign: "left" });
		expect(resolved.hidden).toBe(true);
		expect(resolved.diagnostics).toEqual([]);
	});

	it("uses base layers only when no breakpoint matches", () => {
		const resolved = resolveTargetAppearance(target, contextAt(1200));
		expect(resolved.layout).toEqual({
			display: "flex",
			gap: px(16),
			minWidth: px(20),
		});
		expect(resolved.hidden).toBe(false);
	});

	it("treats null layers at every level as absent, not as a clear", () => {
		// At 700 both breakpoints match; every `mobile` layer is `null`
		// (styleRefs, authored style, hidden, and the definition's own
		// override), so the tablet result must survive unchanged.
		expect(resolveTargetAppearance(target, contextAt(700))).toEqual(
			resolveTargetAppearance(target, contextAt(900)),
		);
	});

	it("ignores an override layer that omits the family being resolved", () => {
		const layoutOnly: TargetAppearance = {
			style: {
				base: { typography: { textAlign: "center" } },
				overrides: {
					tablet: { layout: { gap: px(1) } },
					// A family written as `null` is document data the types do
					// not model but resolution must survive: read as absent.
					mobile: { typography: null } as unknown as AuthorStyle,
				},
			},
		};
		const resolved = resolveTargetAppearance(layoutOnly, contextAt(700));
		expect(resolved.typography).toEqual({ textAlign: "center" });
		expect(resolved.layout).toEqual({
			display: "block",
			gap: px(1),
			minWidth: px(2),
		});
	});

	it("substitutes tokens after precedence selection", () => {
		const tokenTarget: TargetAppearance = {
			style: {
				base: {
					layout: { gap: { kind: "token", tokenId: "space" } },
					typography: { color: { kind: "token", tokenId: "brand" } },
				},
			},
		};
		const resolved = resolveTargetAppearance(tokenTarget, contextAt(1200));
		expect(resolved.layout.gap).toEqual(px(12));
		expect(resolved.typography.color).toEqual({
			kind: "literal",
			value: "#00aaff",
		});
		expect(resolved.diagnostics).toEqual([]);
	});

	it("warns on a style reference that is not in the document", () => {
		const resolved = resolveTargetAppearance(
			{ styleRefs: { base: ["card", "ghost"] } },
			contextAt(1200),
		);
		expect(resolved.diagnostics).toHaveLength(1);
		expect(resolved.diagnostics[0]?.code).toBe("EDITOR_NODE_NOT_FOUND");
		expect(resolved.diagnostics[0]?.severity).toBe("warning");
		expect(resolved.diagnostics[0]?.details).toEqual({
			kind: "styleDefinition",
			id: "ghost",
		});
		// The resolvable reference still contributes.
		expect(resolved.layout.display).toBe("flex");
	});

	it("resolves a styleRefs list with no base and no matching override", () => {
		const resolved = resolveTargetAppearance(
			{ styleRefs: { overrides: { mobile: ["card"] } } },
			contextAt(1200),
		);
		expect(resolved.layout).toEqual({
			display: "block",
			gap: px(99),
			minWidth: px(2),
		});
		expect(resolved.diagnostics).toEqual([]);
	});

	it("resolves an absent target to empty families and visible", () => {
		expect(
			resolveTargetAppearance(undefined, {
				designSystem,
				breakpoints,
				viewportWidth: 900,
				tokenMode: "light",
			}),
		).toEqual({
			layout: {},
			style: {},
			typography: {},
			hidden: false,
			diagnostics: [],
		});
	});

	it("lets a narrower breakpoint reveal a node hidden at a wider one", () => {
		const hiddenTarget: TargetAppearance = {
			hidden: { base: true, overrides: { tablet: false } },
		};
		expect(resolveTargetAppearance(hiddenTarget, contextAt(1200)).hidden).toBe(
			true,
		);
		expect(resolveTargetAppearance(hiddenTarget, contextAt(900)).hidden).toBe(
			false,
		);
	});
});
