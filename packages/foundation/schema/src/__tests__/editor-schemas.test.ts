/**
 * §27.2 mandatory contract tests for `@anvilkit/schema/editor`
 * (PLAN-0020 CORE-P0-005A..F, CORE-P0-006).
 *
 * Fixture families: minimal / complete / unknown-fields /
 * unknown-major-version / limit-cap documents, plus serialize→parse→
 * serialize stability, compaction, frozen-input immutability,
 * migration idempotency, and canonical-serialization determinism.
 */

import type {
	AuthoringStateV1,
	NodeAuthoringStateV1,
	SafeExpression,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	AuthoringStateSchema,
	BindingSchema,
	BreakpointSetSchema,
	ComponentDefinitionSchema,
	ComponentInstanceStateSchema,
	CssLengthSchema,
	canonicalSerializeAuthoring,
	compactAuthoringState,
	compactNodeRecord,
	compactResponsiveValue,
	createAuthoringMigrationRegistry,
	createEmptyAuthoringState,
	detectAuthoringVersion,
	InteractionSchema,
	normalizeAuthoringState,
	normalizeBreakpointOrder,
	SafeExpressionSchema,
	SafeUrlSchema,
	safeParseAuthoringEnvelope,
	safeParseAuthoringState,
	TypographySpecSchema,
} from "../editor.js";

function deepFreeze<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const entry of Object.values(value)) {
			deepFreeze(entry);
		}
		Object.freeze(value);
	}
	return value;
}

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

function completeState(): AuthoringStateV1 {
	return {
		version: "1",
		revision: 7,
		breakpoints: [
			{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
			{ id: "mobile", label: "Mobile", maxWidth: 767, order: 1, enabled: true },
		],
		nodes: {
			"node-a": {
				version: "1",
				name: "Hero",
				locked: true,
				hidden: { overrides: { mobile: true } },
				layout: {
					base: { display: "flex", gap: px(24) },
					overrides: { tablet: { gap: px(16) } },
				},
				style: {
					base: {
						background: {
							kind: "solid",
							color: {
								kind: "literal",
								value: { kind: "hex", value: "#102030" },
							},
						},
						opacity: 0.9,
					},
				},
				typography: {
					base: {
						fontFamily: { kind: "literal", value: "Inter" },
						fontSize: { kind: "token", tokenId: "tok-size" },
					},
				},
				styleRefs: { base: ["sd-1"] },
				interactionRefs: ["int-1"],
				bindingRefs: ["bind-1"],
				accessibility: { label: "Hero section" },
			},
			"node-b": {
				version: "1",
				componentInstance: {
					definitionId: "cdef-1",
					definitionRevision: 2,
					variantSelection: { axis1: "opt1" },
					propOverrides: { title: "Hello", nullable: null },
					nodeOverrides: {
						"def-node-1": { props: { text: "world" } },
					},
				},
			},
		},
		tokens: {
			"tok-size": {
				id: "tok-size",
				path: ["type", "size"],
				name: "Body size",
				type: "length",
				values: {
					light: { kind: "literal", value: px(16) },
					dark: { kind: "alias", tokenId: "tok-size-dark" },
				},
				source: { system: "theme", ref: "typography.body" },
			},
			"tok-size-dark": {
				id: "tok-size-dark",
				path: ["type", "size", "dark"],
				name: "Body size dark",
				type: "length",
				values: { dark: { kind: "literal", value: px(17) } },
			},
		},
		tokenModes: {
			light: { id: "light", name: "Light" },
			dark: { id: "dark", name: "Dark" },
		},
		styleDefinitions: {
			"sd-1": {
				version: "1",
				id: "sd-1",
				name: "Card",
				appliesTo: "container",
				layout: { base: { padding: { top: px(8) } } },
				createdAt: "2026-07-22T00:00:00.000Z",
				updatedAt: "2026-07-22T00:00:00.000Z",
			},
		},
		componentDefinitions: {
			"cdef-1": {
				version: "1",
				id: "cdef-1",
				name: "Card",
				root: {
					type: "Card",
					props: { title: "Default", items: [1, 2, 3], meta: null },
				},
				exposedProps: [
					{ id: "p1", name: "Title", type: "text", sourcePath: ["title"] },
				],
				variantAxes: [
					{
						id: "axis1",
						name: "Tone",
						options: [
							{ id: "opt1", name: "Plain" },
							{ id: "opt2", name: "Bold" },
						],
					},
				],
				variants: [
					{
						id: "var-1",
						selection: { axis1: "opt2" },
						patch: { "def-node-1": { props: { bold: true } } },
					},
				],
				revision: 3,
				createdAt: "2026-07-22T00:00:00.000Z",
				updatedAt: "2026-07-22T00:00:00.000Z",
			},
		},
		interactions: {
			"int-1": {
				version: "1",
				id: "int-1",
				name: "Open link",
				sourceNodeId: "node-a",
				trigger: { type: "click" },
				actions: [{ type: "url", url: "https://example.com", newTab: true }],
				enabled: true,
			},
		},
		bindings: {
			"bind-1": {
				version: "1",
				id: "bind-1",
				nodeId: "node-a",
				target: { type: "prop", path: ["title"] },
				expression: {
					type: "coalesce",
					values: [
						{ type: "path", root: "data", path: ["page", "title"] },
						{ type: "literal", value: "Fallback" },
					],
				},
				fallback: null,
			},
		},
	};
}

describe("envelope and version detection", () => {
	it("classifies absent, v1, unsupported-major, and invalid values", () => {
		expect(detectAuthoringVersion(undefined)).toEqual({ kind: "absent" });
		expect(detectAuthoringVersion(null)).toEqual({ kind: "absent" });
		expect(detectAuthoringVersion(createEmptyAuthoringState())).toEqual({
			kind: "v1",
		});
		expect(detectAuthoringVersion({ version: "2", revision: 0 })).toEqual({
			kind: "unsupported-major",
			version: "2",
		});
		expect(detectAuthoringVersion("nonsense")).toEqual({ kind: "invalid" });
		expect(detectAuthoringVersion([])).toEqual({ kind: "invalid" });
		expect(detectAuthoringVersion({ revision: 0 })).toEqual({
			kind: "invalid",
		});
	});

	it("parses a minimal empty state and preserves unknown envelope keys", () => {
		const withUnknown = {
			...createEmptyAuthoringState(),
			futureFeature: { anything: true },
		};
		const parsed = safeParseAuthoringEnvelope(withUnknown);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect((parsed.data as Record<string, unknown>).futureFeature).toEqual({
				anything: true,
			});
		}
	});

	it("rejects a structurally broken envelope", () => {
		expect(
			safeParseAuthoringEnvelope({ version: "1", revision: -1 }).success,
		).toBe(false);
		expect(safeParseAuthoringEnvelope({ version: "1" }).success).toBe(false);
	});
});

describe("full authoring state (§27.2 families)", () => {
	it("parses the complete fixture", () => {
		const result = safeParseAuthoringState(completeState());
		expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
	});

	it("preserves unknown keys at nested levels through parse", () => {
		const state = completeState() as unknown as Record<string, unknown>;
		(state.nodes as Record<string, Record<string, unknown>>)["node-a"] = {
			...(state.nodes as Record<string, Record<string, unknown>>)["node-a"],
			futureNodeField: "kept",
		};
		const parsed = safeParseAuthoringState(state);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			const node = (parsed.data.nodes as Record<string, unknown>)["node-a"];
			expect((node as Record<string, unknown>).futureNodeField).toBe("kept");
		}
	});

	it("rejects map keys that do not match object ids (invariant 7)", () => {
		const state = completeState();
		const broken = {
			...state,
			tokens: { "wrong-key": state.tokens["tok-size"] },
		};
		const result = safeParseAuthoringState(broken);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain("invariant 7");
		}
	});

	it("survives serialize→parse→serialize byte-stably", () => {
		const state = completeState();
		const first = canonicalSerializeAuthoring(state);
		const reparsed = safeParseAuthoringState(JSON.parse(first.text));
		expect(reparsed.success).toBe(true);
		if (reparsed.success) {
			const second = canonicalSerializeAuthoring(reparsed.data);
			expect(second.text).toBe(first.text);
			expect(second.bytes).toBe(first.bytes);
		}
	});

	it("does not mutate frozen inputs during parse and compaction", () => {
		const state = deepFreeze(completeState());
		expect(() => safeParseAuthoringState(state)).not.toThrow();
		expect(() => compactAuthoringState(state)).not.toThrow();
		expect(() => canonicalSerializeAuthoring(state)).not.toThrow();
		expect(state.nodes["node-a"]?.layout?.base?.gap).toEqual(px(24));
	});
});

describe("CSS safety (§9.3)", () => {
	it("rejects raw strings where typed lengths are required", () => {
		expect(CssLengthSchema.safeParse("12px").success).toBe(false);
		expect(CssLengthSchema.safeParse("url(javascript:alert(1))").success).toBe(
			false,
		);
		expect(CssLengthSchema.safeParse(px(12)).success).toBe(true);
	});

	it("rejects declaration syntax smuggled into font family names", () => {
		const smuggled = {
			fontFamily: {
				kind: "literal",
				value: 'Inter"; background: url(evil)',
			},
		};
		expect(TypographySpecSchema.safeParse(smuggled).success).toBe(false);
	});
});

describe("breakpoint invariants (§12.2)", () => {
	const bp = (id: string, maxWidth: number, order = 0, enabled = true) => ({
		id,
		label: id,
		maxWidth,
		order,
		enabled,
	});

	it("rejects the reserved id, duplicates, and out-of-range widths", () => {
		expect(BreakpointSetSchema.safeParse([bp("base", 800)]).success).toBe(
			false,
		);
		expect(
			BreakpointSetSchema.safeParse([bp("a", 800), bp("a", 700)]).success,
		).toBe(false);
		expect(
			BreakpointSetSchema.safeParse([bp("a", 800), bp("b", 800)]).success,
		).toBe(false);
		expect(BreakpointSetSchema.safeParse([bp("a", 100)]).success).toBe(false);
		expect(BreakpointSetSchema.safeParse([bp("a", 8000)]).success).toBe(false);
		expect(BreakpointSetSchema.safeParse([bp("a", 767.5)]).success).toBe(false);
	});

	it("caps enabled breakpoints at eight with a stable limit issue", () => {
		const nine = Array.from({ length: 9 }, (_, index) =>
			bp(`bp-${index}`, 300 + index * 100, index),
		);
		const result = BreakpointSetSchema.safeParse(nine);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain(
				"EDITOR_LIMIT_EXCEEDED",
			);
		}
		const eight = nine.slice(0, 8);
		expect(BreakpointSetSchema.safeParse(eight).success).toBe(true);
	});

	it("normalizes display order from widths, widest first", () => {
		const normalized = normalizeBreakpointOrder([
			bp("narrow", 480, 5),
			bp("wide", 1200, 2),
		]);
		expect(normalized.map((b) => b.id)).toEqual(["wide", "narrow"]);
		expect(normalized.map((b) => b.order)).toEqual([0, 1]);
	});
});

describe("component identifier rules (CORE-P0-001 freeze)", () => {
	it("rejects runtime composite ids in override keys", () => {
		const instance = {
			definitionId: "cdef-1",
			definitionRevision: 0,
			variantSelection: {},
			propOverrides: {},
			nodeOverrides: { "inst-1::def-node-1": { props: {} } },
		};
		expect(ComponentInstanceStateSchema.safeParse(instance).success).toBe(
			false,
		);
	});

	it("rejects variant selections referencing unknown axes", () => {
		const definition = completeState().componentDefinitions["cdef-1"];
		const broken = {
			...definition,
			variants: [{ id: "v", selection: { ghostAxis: "x" }, patch: {} }],
		};
		expect(ComponentDefinitionSchema.safeParse(broken).success).toBe(false);
	});

	it("caps variant axes at three", () => {
		const definition = completeState().componentDefinitions["cdef-1"];
		const axes = Array.from({ length: 4 }, (_, index) => ({
			id: `axis-${index}`,
			name: `Axis ${index}`,
			options: [{ id: "o", name: "O" }],
		}));
		const broken = { ...definition, variantAxes: axes, variants: [] };
		const result = ComponentDefinitionSchema.safeParse(broken);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain(
				"variantAxesPerComponent",
			);
		}
	});
});

describe("interaction URL and action caps (§16)", () => {
	it("makes javascript: unrepresentable", () => {
		expect(SafeUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
		expect(SafeUrlSchema.safeParse("JAVASCRIPT:alert(1)").success).toBe(false);
		expect(SafeUrlSchema.safeParse("data:text/html,x").success).toBe(false);
		expect(SafeUrlSchema.safeParse("https://example.com").success).toBe(true);
		expect(SafeUrlSchema.safeParse("mailto:a@b.c").success).toBe(true);
		expect(SafeUrlSchema.safeParse("tel:+123").success).toBe(true);
	});

	it("caps actions per interaction at 100", () => {
		const interaction = {
			...completeState().interactions["int-1"],
			actions: Array.from({ length: 101 }, () => ({
				type: "url" as const,
				url: "https://example.com",
			})),
		};
		const result = InteractionSchema.safeParse(interaction);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain(
				"actionsPerInteraction",
			);
		}
	});
});

describe("safe expression bombs (§19)", () => {
	function nest(depth: number): SafeExpression {
		let expression: SafeExpression = { type: "literal", value: 1 };
		for (let index = 0; index < depth - 1; index += 1) {
			expression = { type: "not", value: expression };
		}
		return expression;
	}

	it("accepts depth 16 and rejects depth 17 at parse time", () => {
		expect(SafeExpressionSchema.safeParse(nest(16)).success).toBe(true);
		const result = SafeExpressionSchema.safeParse(nest(17));
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain("bindingAstDepth");
		}
	});

	it("rejects node-count bombs at parse time", () => {
		const wide: SafeExpression = {
			type: "boolean",
			operator: "or",
			values: Array.from({ length: 256 }, () => ({
				type: "literal" as const,
				value: true,
			})),
		};
		const result = SafeExpressionSchema.safeParse(wide);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(JSON.stringify(result.error.issues)).toContain(
				"bindingAstNodeCount",
			);
		}
	});

	it("keeps binding fallback JSON null intact", () => {
		const binding = completeState().bindings["bind-1"];
		const parsed = BindingSchema.safeParse(binding);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.fallback).toBeNull();
		}
	});
});

describe("compaction (§7.2)", () => {
	it("removes null override entries but keeps JSON null in props", () => {
		const record: NodeAuthoringStateV1 = {
			version: "1",
			layout: {
				base: { display: "flex" },
				overrides: { tablet: null },
			},
			componentInstance: {
				definitionId: "cdef-1",
				definitionRevision: 0,
				variantSelection: {},
				propOverrides: { emptied: null },
				nodeOverrides: {},
			},
		};
		const compacted = compactNodeRecord(record);
		expect(compacted?.layout).toEqual({ base: { display: "flex" } });
		expect(compacted?.componentInstance?.propOverrides.emptied).toBeNull();
	});

	it("drops default-only records entirely (invariant 3)", () => {
		expect(
			compactNodeRecord({ version: "1", locked: false, interactionRefs: [] }),
		).toBeUndefined();
		expect(
			compactNodeRecord({ version: "1", hidden: { overrides: { m: null } } }),
		).toBeUndefined();
	});

	it("preserves unknown keys through compaction", () => {
		const record = {
			version: "1",
			futureField: { keep: true },
		} as unknown as NodeAuthoringStateV1;
		const compacted = compactNodeRecord(record);
		expect(
			(compacted as unknown as Record<string, unknown>).futureField,
		).toEqual({ keep: true });
	});

	it("is idempotent", () => {
		const once = compactAuthoringState(completeState());
		const twice = compactAuthoringState(once);
		expect(twice).toEqual(once);
	});

	it("collapses to the canonical empty shape and normalizes order", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			breakpoints: [
				{ id: "m", label: "M", maxWidth: 480, order: 9, enabled: true },
				{ id: "t", label: "T", maxWidth: 991, order: 1, enabled: true },
			],
			nodes: { ghost: { version: "1" } },
		};
		const normalized = normalizeAuthoringState(state);
		expect(normalized.nodes).toEqual({});
		expect(normalized.breakpoints.map((b) => b.id)).toEqual(["t", "m"]);
	});

	it("collapses responsive values with nothing left to undefined", () => {
		expect(compactResponsiveValue({ overrides: { a: null } })).toBeUndefined();
		expect(compactResponsiveValue(undefined)).toBeUndefined();
		expect(compactResponsiveValue({ base: 1 })).toEqual({ base: 1 });
	});
});

describe("canonical serialization (CORE-P0-006)", () => {
	it("is insensitive to key insertion order", () => {
		const a = completeState();
		// Reverse insertion order at the top level and inside one node
		// record; canonical output must not change.
		const reversedNode = Object.fromEntries(
			Object.entries(a.nodes["node-a"] as object).reverse(),
		) as NodeAuthoringStateV1;
		const reversed = Object.fromEntries(
			Object.entries({
				...a,
				nodes: { ...a.nodes, "node-a": reversedNode },
			}).reverse(),
		) as unknown as AuthoringStateV1;
		expect(canonicalSerializeAuthoring(reversed).text).toBe(
			canonicalSerializeAuthoring(a).text,
		);
		expect(canonicalSerializeAuthoring(reversed).bytes).toBe(
			canonicalSerializeAuthoring(a).bytes,
		);
	});

	it("measures UTF-8 bytes for multibyte content", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			nodes: { n1: { version: "1", name: "标题🎨" } },
		};
		const { text, bytes } = canonicalSerializeAuthoring(state);
		expect(bytes).toBe(new TextEncoder().encode(text).length);
		expect(bytes).toBeGreaterThan(text.length);
	});

	it("emits no whitespace and sorted keys", () => {
		const { text } = canonicalSerializeAuthoring(createEmptyAuthoringState());
		expect(text).not.toMatch(/\s/);
		const keys = Object.keys(JSON.parse(text) as Record<string, unknown>);
		expect(keys).toEqual([...keys].sort());
	});
});

describe("migration registry skeleton (§26.3)", () => {
	it("returns current-version state as-is and is idempotent", () => {
		const registry = createAuthoringMigrationRegistry();
		const state = completeState();
		const once = registry.run(state as unknown as Record<string, unknown>);
		const twice = registry.run(once as unknown as Record<string, unknown>);
		expect(twice).toEqual(once);
	});

	it("chains a registered step and rejects duplicates and cycles", () => {
		const registry = createAuthoringMigrationRegistry();
		registry.register({
			from: "0",
			to: "1",
			migrate: (state) => ({ ...state, version: "1", revision: 0 }),
		});
		expect(() =>
			registry.register({ from: "0", to: "1", migrate: (s) => ({ ...s }) }),
		).toThrow();
		const migrated = registry.run({ version: "0" });
		expect(migrated.version).toBe("1");
		expect(() => registry.run({ version: "9" })).toThrow(
			/no migration registered/,
		);
	});
});
