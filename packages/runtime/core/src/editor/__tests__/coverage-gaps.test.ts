/**
 * Targeted branch-coverage tests for the ≥95% reducer/resolver gate
 * (PLAN-0020 Phase 0 exit criterion) — paths the main suites skim:
 * style/typography commands, base-layer guards, noop short-circuits,
 * patch recursion edges, invariant helper, serializer fallbacks.
 */

import type {
	AuthoringStateV1,
	EditorCommandBase,
} from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	applyEditorPatch,
	checkInvariant,
	createEmptyAuthoringState,
	deepEqualJson,
	diffAuthoringState,
	EditorInvariantError,
	makeEditorError,
	mergePropertyWise,
	reduceValidatedCommand,
	resolveNodeAuthoring,
	resolveResponsiveValue,
	serializeBorderEdge,
	serializeCssLength,
	serializeFilter,
	serializePaint,
	serializeShadow,
	stripPatchNulls,
	validateEditorCommand,
} from "../index.js";

let counter = 0;
function base(expectedRevision: number): EditorCommandBase {
	counter += 1;
	return {
		id: `gap-${counter}`,
		expectedRevision,
		source: "canvas",
		timestamp: 1_750_000_000_000,
	};
}

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

const red = {
	kind: "literal",
	value: { kind: "hex", value: "#ff0000" },
} as const;

function withTablet(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [
			{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
		],
	};
}

describe("style and typography commands", () => {
	it("writes style patches at base and override layers", () => {
		let state = withTablet();
		state = applyEditorCommand(state, {
			...base(0),
			type: "node.style.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { opacity: 0.5 },
		}).state;
		const result = applyEditorCommand(state, {
			...base(1),
			type: "node.style.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			patch: { opacity: 0.8 },
		});
		expect(result.state.nodes.n1?.style).toEqual({
			base: { opacity: 0.5 },
			overrides: { tablet: { opacity: 0.8 } },
		});
	});

	it("writes and rejects typography patches", () => {
		const good = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.typography.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { textAlign: "center" },
		});
		expect(good.state.nodes.n1?.typography?.base).toEqual({
			textAlign: "center",
		});
		const bad = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.typography.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { fontFamily: { kind: "literal", value: "Evil;}" } },
		});
		expect(bad.status).toBe("rejected");
		expect(bad.errors[0]?.code).toBe("EDITOR_INVALID_CSS_VALUE");
	});

	it("rejects style patches with invalid values", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.style.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			patch: { opacity: 7 as never },
		});
		expect(result.status).toBe("rejected");
	});
});

describe("guard branches", () => {
	it("rejects responsiveOverride.set targeting the base layer", () => {
		const result = applyEditorCommand(withTablet(), {
			...base(0),
			type: "node.responsiveOverride.set",
			nodeIds: ["n1"],
			breakpointId: "base" as never,
			family: "layout",
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_BREAKPOINT_INVALID");
	});

	it("treats same-name rename and already-locked lock as noops", () => {
		let state = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.rename",
			nodeId: "n1",
			name: "Hero",
		}).state;
		expect(
			applyEditorCommand(state, {
				...base(1),
				type: "node.rename",
				nodeId: "n1",
				name: "Hero",
			}).status,
		).toBe("noop");
		state = applyEditorCommand(state, {
			...base(1),
			type: "node.lock.set",
			nodeIds: ["n1"],
			locked: true,
		}).state;
		expect(
			applyEditorCommand(state, {
				...base(2),
				type: "node.lock.set",
				nodeIds: ["n1"],
				locked: true,
			}).status,
		).toBe("noop");
		// Clearing a name that was never set is also a noop.
		expect(
			applyEditorCommand(state, {
				...base(2),
				type: "node.rename",
				nodeId: "unnamed",
				name: null,
			}).status,
		).toBe("noop");
	});

	it("sets and clears base-layer visibility", () => {
		const hidden = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "node.visibility.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			hidden: true,
		}).state;
		expect(hidden.nodes.n1?.hidden).toEqual({ base: true });
		const cleared = applyEditorCommand(hidden, {
			...base(1),
			type: "node.visibility.set",
			nodeIds: ["n1"],
			breakpointId: "base",
			hidden: null,
		});
		expect(cleared.state.nodes.n1).toBeUndefined();
	});

	it("validates batch envelopes without touching member internals", () => {
		const errors = validateEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "batch",
			label: "ok",
			commands: [{ ...base(0), type: "node.rename", nodeId: "n1", name: "x" }],
		});
		expect(errors).toEqual([]);
	});
});

describe("patch edges", () => {
	it("recurses into nested objects and prunes emptied ones", () => {
		const next = applyEditorPatch(
			{ padding: { top: px(8) }, display: "flex" },
			{ padding: { top: null } },
		);
		expect(next).toEqual({ display: "flex" });
	});

	it("returns the same reference for no-op patches", () => {
		const target = { display: "flex" as const };
		expect(applyEditorPatch(target, {})).toBe(target);
		expect(applyEditorPatch(target, { display: "flex" })).toBe(target);
		expect(applyEditorPatch(target, { gap: null } as never)).toBe(target);
	});

	it("returns undefined when everything is removed", () => {
		expect(applyEditorPatch({ display: "flex" }, { display: null })).toBe(
			undefined,
		);
		expect(applyEditorPatch(undefined, {})).toBe(undefined);
	});

	it("replaces atomic values wholesale and compares arrays deeply", () => {
		const next = applyEditorPatch({ gap: px(8) }, { gap: px(12) });
		expect(next).toEqual({ gap: px(12) });
		expect(deepEqualJson([1, [2]], [1, [2]])).toBe(true);
		expect(deepEqualJson([1], [1, 2])).toBe(false);
		expect(deepEqualJson({ a: 1 }, { a: 1, b: undefined })).toBe(true);
		expect(deepEqualJson({ a: 1 }, { a: 2 })).toBe(false);
		expect(deepEqualJson(1, "1")).toBe(false);
	});

	it("strips nulls without entering atomic values or arrays", () => {
		expect(
			stripPatchNulls({
				gap: null,
				padding: { top: null, left: px(2) },
				list: [null],
				value: { kind: "literal", value: null },
			}),
		).toEqual({
			padding: { left: px(2) },
			list: [null],
			value: { kind: "literal", value: null },
		});
		expect(stripPatchNulls(3)).toBe(3);
	});
});

describe("diagnostics helper", () => {
	it("passes through on satisfied invariants", () => {
		expect(
			checkInvariant(true, () => makeEditorError("EDITOR_NODE_LOCKED", "x")),
		).toBeNull();
	});

	it("throws EditorInvariantError in development builds", () => {
		// Vitest runs with NODE_ENV=test — a development build.
		expect(() =>
			checkInvariant(false, () =>
				makeEditorError("EDITOR_NODE_LOCKED", "violated", {
					severity: "error",
					recoverable: false,
					path: ["nodes"],
					nodeIds: ["n1"],
					details: { probe: true },
				}),
			),
		).toThrow(EditorInvariantError);
	});
});

describe("merge and responsive edges", () => {
	it("treats type-discriminated objects as atomic", () => {
		expect(
			mergePropertyWise<Record<string, unknown>>(
				{ trigger: { type: "click", extra: 1 } },
				{ trigger: { type: "hover" } },
			),
		).toEqual({ trigger: { type: "hover" } });
	});

	it("replaces primitives with objects and vice versa", () => {
		expect(
			mergePropertyWise<Record<string, unknown>>({ a: 1 }, { a: { b: 2 } }),
		).toEqual({ a: { b: 2 } });
		expect(
			mergePropertyWise<Record<string, unknown>>({ a: { b: 2 } }, { a: 1 }),
		).toEqual({ a: 1 });
	});

	it("resolves with zero configured breakpoints", () => {
		const resolved = resolveResponsiveValue({ base: 5 }, [], 500, (_b, o) => o);
		expect(resolved).toEqual({ value: 5, source: "base", inherited: false });
	});
});

describe("serializer fallbacks", () => {
	it("propagates unresolved tokens as null through composites", () => {
		const tokenLength = { kind: "token", tokenId: "t" } as const;
		expect(
			serializeShadow({
				kind: "drop",
				offsetX: tokenLength,
				offsetY: px(1),
				blur: px(2),
				color: red,
			}),
		).toBeNull();
		expect(serializeFilter({ blur: tokenLength })).toBeNull();
		expect(
			serializeBorderEdge({ width: tokenLength, style: "solid" }),
		).toBeNull();
		expect(
			serializePaint({
				kind: "linear-gradient",
				angle: 0,
				stops: [
					{ color: { kind: "token", tokenId: "t" }, offset: 0 },
					{ color: red, offset: 1 },
				],
			}),
		).toBeNull();
		expect(
			serializePaint({
				kind: "solid",
				color: { kind: "token", tokenId: "t" },
			}),
		).toBeNull();
		expect(
			serializeCssLength({
				kind: "math",
				expression: { kind: "token", tokenId: "t" },
			}),
		).toBeNull();
	});
});

describe("diff branches", () => {
	it("reports node additions and removals", () => {
		const a = createEmptyAuthoringState();
		const b: AuthoringStateV1 = {
			...a,
			nodes: { n1: { version: "1", name: "X" } },
		};
		expect(diffAuthoringState(a, b).changedNodeIds).toEqual(["n1"]);
		expect(diffAuthoringState(b, a).changedNodeIds).toEqual(["n1"]);
		expect(diffAuthoringState(b, a).changedCollections).toEqual(["nodes"]);
	});
});

describe("residual reachable branches", () => {
	it("skips the nodes collection when references differ but entries match", () => {
		const a = createEmptyAuthoringState();
		const aliased: AuthoringStateV1 = { ...a, nodes: { ...a.nodes } };
		const diff = diffAuthoringState(a, aliased);
		expect(diff.changedNodeIds).toEqual([]);
		expect(diff.changedCollections).toEqual([]);
	});

	it("treats identical override rewrites as noops (layout + visibility)", () => {
		let state = withTablet();
		const layoutWrite = {
			type: "node.layout.set" as const,
			nodeIds: ["n1"],
			breakpointId: "tablet" as const,
			patch: { gap: px(16) },
		};
		state = applyEditorCommand(state, { ...base(0), ...layoutWrite }).state;
		expect(
			applyEditorCommand(state, { ...base(1), ...layoutWrite }).status,
		).toBe("noop");
		state = applyEditorCommand(state, {
			...base(1),
			type: "node.visibility.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			hidden: true,
		}).state;
		expect(
			applyEditorCommand(state, {
				...base(2),
				type: "node.visibility.set",
				nodeIds: ["n1"],
				breakpointId: "tablet",
				hidden: true,
			}).status,
		).toBe("noop");
	});

	it("removes a family entirely when its only override is cleared", () => {
		let state = withTablet();
		state = applyEditorCommand(state, {
			...base(0),
			type: "node.layout.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			patch: { gap: px(16) },
		}).state;
		const result = applyEditorCommand(state, {
			...base(1),
			type: "node.responsiveOverride.set",
			nodeIds: ["n1"],
			breakpointId: "tablet",
			family: "layout",
		});
		expect(result.status).toBe("changed");
		expect(result.state.nodes.n1).toBeUndefined();
	});
});

describe("node resolution edges", () => {
	it("skips null styleRef override entries and walks arrays for tokens", async () => {
		const { resolveNodeAuthoring } = await import("../index.js");
		const state: AuthoringStateV1 = {
			...withTablet(),
			nodes: {
				n1: {
					version: "1",
					styleRefs: { base: ["sd"], overrides: { tablet: null } },
					style: {
						base: {
							shadows: [
								{
									kind: "drop",
									offsetX: px(0),
									offsetY: px(1),
									blur: px(2),
									color: { kind: "token", tokenId: "shade" },
								},
							],
						},
					},
				},
			},
			tokens: {
				shade: {
					id: "shade",
					path: ["fx"],
					name: "Shade",
					type: "color",
					values: {
						light: {
							kind: "literal",
							value: { kind: "hex", value: "#00000080" },
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
					layout: { base: { display: "flex" } },
					createdAt: "2026-07-22T00:00:00.000Z",
					updatedAt: "2026-07-22T00:00:00.000Z",
				},
			},
		};
		const resolved = resolveNodeAuthoring("n1", {
			authoring: state,
			breakpoints: state.breakpoints,
			viewportWidth: 900,
			tokenMode: "light",
		});
		// The null override entry resumes inheritance: base refs stay active.
		expect(resolved.layout.display).toBe("flex");
		const shadows = resolved.style.shadows;
		expect(shadows?.[0]?.color).toEqual({
			kind: "literal",
			value: { kind: "hex", value: "#00000080" },
		});
	});
});

describe("byte-limit defaults and tighten-only clamp (CORE-P0-014)", () => {
	it("returns frozen defaults with no overrides", async () => {
		const { EDITOR_BYTE_LIMIT_DEFAULTS, resolveByteLimits } = await import(
			"../limits.js"
		);
		const resolved = resolveByteLimits();
		expect(resolved.limits).toEqual(EDITOR_BYTE_LIMIT_DEFAULTS);
		expect(resolved.errors).toEqual([]);
	});

	it("accepts tightening and rejects loosening with a diagnostic", async () => {
		const { EDITOR_BYTE_LIMIT_DEFAULTS, resolveByteLimits } = await import(
			"../limits.js"
		);
		const resolved = resolveByteLimits({
			sidecarWarnBytes: 1_000_000,
			sidecarMaxBytes: EDITOR_BYTE_LIMIT_DEFAULTS.sidecarMaxBytes * 2,
			commandMaxBytes: -5,
		});
		expect(resolved.limits.sidecarWarnBytes).toBe(1_000_000);
		expect(resolved.limits.sidecarMaxBytes).toBe(
			EDITOR_BYTE_LIMIT_DEFAULTS.sidecarMaxBytes,
		);
		expect(resolved.limits.commandMaxBytes).toBe(
			EDITOR_BYTE_LIMIT_DEFAULTS.commandMaxBytes,
		);
		expect(resolved.errors).toHaveLength(2);
		expect(
			resolved.errors.every(
				(error) => error.code === "EDITOR_LIMIT_EXCEEDED",
			),
		).toBe(true);
	});
});

/**
 * REVIEW-0019 §3.3 finding 1: measured branch coverage was 72.26% on
 * `src/editor/commands/` and 92.94% on `src/editor/resolve/` against
 * the ≥95% floor PLAN-0020 §13 mandates, and nothing enforced it.
 * These close the gap on the paths that actually matter — the
 * breakpoint-removal fold, every reducer noop/missing-entity
 * short-circuit, and the resolver precedence edges — and
 * `pnpm check:coverage` now fails below 95%.
 */

const BP_DESKTOP = {
	id: "desktop",
	label: "Desktop",
	maxWidth: 1439,
	order: 0,
	enabled: true,
} as const;
const BP_TABLET = {
	id: "tablet",
	label: "Tablet",
	maxWidth: 991,
	order: 1,
	enabled: true,
} as const;
const BP_MOBILE = {
	id: "mobile",
	label: "Mobile",
	maxWidth: 599,
	order: 2,
	enabled: true,
} as const;

function withBreakpoints(
	...breakpoints: AuthoringStateV1["breakpoints"]
): AuthoringStateV1 {
	return { ...createEmptyAuthoringState(), breakpoints };
}

/** Seed a node record directly — faster and clearer than N commands. */
function withNode(
	state: AuthoringStateV1,
	nodeId: string,
	record: Record<string, unknown>,
): AuthoringStateV1 {
	return {
		...state,
		nodes: { ...state.nodes, [nodeId]: record as never },
	};
}

describe("breakpoints.set — ordering, identity, and override folding", () => {
	it("sorts widest-first and rewrites order indices", () => {
		const result = applyEditorCommand(withBreakpoints(), {
			...base(0),
			type: "breakpoints.set",
			// Deliberately unsorted and with wrong `order` values.
			breakpoints: [
				{ ...BP_MOBILE, order: 0 },
				{ ...BP_DESKTOP, order: 7 },
				{ ...BP_TABLET, order: 3 },
			],
		});
		expect(result.state.breakpoints.map((entry) => entry.id)).toEqual([
			"desktop",
			"tablet",
			"mobile",
		]);
		expect(result.state.breakpoints.map((entry) => entry.order)).toEqual([
			0, 1, 2,
		]);
	});

	it("is a noop when the list is already identical", () => {
		const state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP, BP_TABLET],
		});
		expect(result.status).toBe("noop");
		// Reference identity: the reducer must not rebuild an equal list.
		expect(result.state.breakpoints).toBe(state.breakpoints);
	});

	it("is not a noop when only a label differs", () => {
		const state = withBreakpoints(BP_DESKTOP);
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [{ ...BP_DESKTOP, label: "Wide" }],
		});
		expect(result.status).toBe("changed");
		expect(result.state.breakpoints[0]?.label).toBe("Wide");
	});

	it("is not a noop when the list shrinks", () => {
		const state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
		});
		expect(result.status).toBe("changed");
		expect(result.state.breakpoints).toHaveLength(1);
	});

	it("discards overrides at a removed breakpoint by default", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			layout: { base: { gap: px(4) }, overrides: { tablet: { gap: px(8) } } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
		});
		expect(result.state.nodes.n1?.layout).toEqual({ base: { gap: px(4) } });
	});

	it("folds an object override into base under merge-to-base", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			layout: {
				base: { gap: px(4), padding: { top: px(1) } },
				overrides: { tablet: { gap: px(8) } },
			},
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "merge-to-base" },
		});
		// The removed layer's value wins; untouched base keys survive.
		expect(result.state.nodes.n1?.layout).toEqual({
			base: { gap: px(8), padding: { top: px(1) } },
		});
	});

	it("replaces base wholesale when folding a scalar family (hidden)", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			hidden: { base: false, overrides: { tablet: true } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "merge-to-base" },
		});
		expect(result.state.nodes.n1?.hidden).toEqual({ base: true });
	});

	it("folds into an absent base by promoting the override", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			style: { overrides: { tablet: { opacity: 0.25 } } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "merge-to-base" },
		});
		expect(result.state.nodes.n1?.style).toEqual({ base: { opacity: 0.25 } });
	});

	it("drops the family entirely when nothing survives the fold", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			layout: { overrides: { tablet: { gap: px(8) } } },
			style: { base: { opacity: 1 } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "discard" },
		});
		expect(result.state.nodes.n1?.layout).toBeUndefined();
		// Untouched families are preserved.
		expect(result.state.nodes.n1?.style).toEqual({ base: { opacity: 1 } });
	});

	it("keeps overrides at breakpoints that survive", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET, BP_MOBILE);
		state = withNode(state, "n1", {
			layout: {
				base: { gap: px(1) },
				overrides: { tablet: { gap: px(2) }, mobile: { gap: px(3) } },
			},
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP, BP_MOBILE],
			removedOverrides: { tablet: "discard" },
		});
		expect(result.state.nodes.n1?.layout).toEqual({
			base: { gap: px(1) },
			overrides: { mobile: { gap: px(3) } },
		});
	});

	it("removes two breakpoints in one command, mixing fold modes", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET, BP_MOBILE);
		state = withNode(state, "n1", {
			layout: {
				base: { gap: px(1) },
				overrides: { tablet: { gap: px(2) }, mobile: { rowGap: px(3) } },
			},
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "discard", mobile: "merge-to-base" },
		});
		expect(result.state.nodes.n1?.layout).toEqual({
			base: { gap: px(1), rowGap: px(3) },
		});
	});

	it("skips a node whose families carry no overrides at all", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", { layout: { base: { gap: px(4) } } });
		const before = state.nodes.n1;
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
		});
		// Untouched records must keep reference identity — this is what
		// keeps the §28 resolve budget reachable on large documents.
		expect(result.state.nodes.n1).toBe(before);
	});

	it("treats an explicitly null override as nothing to fold", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			layout: { base: { gap: px(4) }, overrides: { tablet: null } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "merge-to-base" },
		});
		// `null` is "explicitly no value at this layer", not a value to
		// promote — base must be untouched.
		expect(result.state.nodes.n1?.layout?.base).toEqual({ gap: px(4) });
	});

	it("folds styleRefs (an array family) by replacement", () => {
		let state = withBreakpoints(BP_DESKTOP, BP_TABLET);
		state = withNode(state, "n1", {
			styleRefs: { base: ["sd-a"], overrides: { tablet: ["sd-b"] } },
		});
		const result = applyEditorCommand(state, {
			...base(0),
			type: "breakpoints.set",
			breakpoints: [BP_DESKTOP],
			removedOverrides: { tablet: "merge-to-base" },
		});
		// Arrays are not property-wise merged — the layer's list wins.
		expect(result.state.nodes.n1?.styleRefs).toEqual({ base: ["sd-b"] });
	});
});

describe("reducer noop and missing-entity short-circuits", () => {
	function definition(id: string): Record<string, unknown> {
		return {
			version: "1",
			id,
			name: id,
			appliesTo: "any",
			layout: { base: { gap: px(4) } },
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
	}

	function withDefinition(id: string): AuthoringStateV1 {
		const state = createEmptyAuthoringState();
		return {
			...state,
			styleDefinitions: { [id]: definition(id) as never },
		};
	}

	function withToken(id: string): AuthoringStateV1 {
		const state = createEmptyAuthoringState();
		return {
			...state,
			tokens: {
				[id]: { id, path: ["group", id], name: id, type: "color", values: {} },
			} as never,
		};
	}

	// Two layers, asserted separately and on purpose. `applyEditorCommand`
	// must REJECT an update naming a missing entity (fail-closed: a patch
	// may never conjure a definition the author never created), while
	// `reduceValidatedCommand` — the reducer proper, which callers reach
	// only after validation has passed — must still return the input state
	// by reference if it ever sees one. That defensive branch is
	// unreachable through the validating entry point, which is exactly why
	// it needs a direct test rather than none.
	it("rejects an update naming a missing style definition", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "styleDefinition.update",
			styleDefinitionId: "missing",
			patch: { name: "renamed" },
		});
		expect(result.status).toBe("rejected");
		expect(result.state.styleDefinitions.missing).toBeUndefined();
	});

	it("reduces a missing style definition to the input state", () => {
		const state = createEmptyAuthoringState();
		expect(
			reduceValidatedCommand(state, {
				...base(0),
				type: "styleDefinition.update",
				styleDefinitionId: "missing",
				patch: { name: "renamed" },
			}),
		).toBe(state);
	});

	it("treats a styleDefinition.update that changes nothing as a noop", () => {
		const state = withDefinition("sd-a");
		const result = applyEditorCommand(state, {
			...base(0),
			type: "styleDefinition.update",
			styleDefinitionId: "sd-a",
			patch: { name: "sd-a" },
		});
		expect(result.status).toBe("noop");
		expect(result.state.styleDefinitions["sd-a"]).toBe(
			state.styleDefinitions["sd-a"],
		);
	});

	it("applies a real styleDefinition.update", () => {
		const state = withDefinition("sd-a");
		const result = applyEditorCommand(state, {
			...base(0),
			type: "styleDefinition.update",
			styleDefinitionId: "sd-a",
			patch: { name: "renamed" },
		});
		expect(result.state.styleDefinitions["sd-a"]?.name).toBe("renamed");
	});

	it("rejects an update naming a missing token", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "token.update",
			tokenId: "missing",
			patch: { name: "x" },
		});
		expect(result.status).toBe("rejected");
		expect(result.state.tokens.missing).toBeUndefined();
	});

	it("reduces a missing token to the input state", () => {
		const state = createEmptyAuthoringState();
		expect(
			reduceValidatedCommand(state, {
				...base(0),
				type: "token.update",
				tokenId: "missing",
				patch: { name: "x" },
			}),
		).toBe(state);
	});

	it("treats a token.update that changes nothing as a noop", () => {
		const state = withToken("tok-a");
		const result = applyEditorCommand(state, {
			...base(0),
			type: "token.update",
			tokenId: "tok-a",
			patch: { name: "tok-a" },
		});
		expect(result.status).toBe("noop");
		expect(result.state.tokens["tok-a"]).toBe(state.tokens["tok-a"]);
	});

	it("applies a real token.update", () => {
		const state = withToken("tok-a");
		const result = applyEditorCommand(state, {
			...base(0),
			type: "token.update",
			tokenId: "tok-a",
			patch: { name: "renamed" },
		});
		expect(result.state.tokens["tok-a"]?.name).toBe("renamed");
	});

	it("rejects an update naming a missing component definition", () => {
		const result = applyEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "component.definition.update",
			definitionId: "missing",
			patch: { name: "x" },
		});
		expect(result.status).toBe("rejected");
		expect(result.state.componentDefinitions.missing).toBeUndefined();
	});

	it("reduces a missing component definition to the input state", () => {
		const state = createEmptyAuthoringState();
		expect(
			reduceValidatedCommand(state, {
				...base(0),
				type: "component.definition.update",
				definitionId: "missing",
				patch: { name: "x" },
			}),
		).toBe(state);
	});

	// The reducer's `default` arm: later-phase command types never reach
	// reduction because validation rejects them with
	// EDITOR_CAPABILITY_UNSUPPORTED first, so the arm is a guard, not a
	// path. Assert both halves of that contract.
	it("rejects an unknown command type and reduces it to the input state", () => {
		const state = createEmptyAuthoringState();
		const bogus = {
			...base(0),
			type: "not.a.real.command",
		} as unknown as Parameters<typeof reduceValidatedCommand>[1];
		expect(applyEditorCommand(state, bogus as never).status).toBe("rejected");
		expect(reduceValidatedCommand(state, bogus)).toBe(state);
	});
});

describe("breakpoint validation rejects malformed sets", () => {
	function reject(breakpoints: readonly unknown[]) {
		return validateEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "breakpoints.set",
			breakpoints: breakpoints as never,
		});
	}

	it("rejects more breakpoints than the frozen §7.3 cap", () => {
		const errors = reject(
			Array.from({ length: 9 }, (_, index) => ({
				id: `bp-${index}`,
				label: `BP ${index}`,
				maxWidth: 400 + index,
				order: index,
				enabled: true,
			})),
		);
		expect(errors.some((error) => error.code === "EDITOR_LIMIT_EXCEEDED")).toBe(
			true,
		);
	});

	it('rejects the reserved id "base" and an empty id', () => {
		for (const id of ["base", ""]) {
			const errors = reject([
				{ id, label: "X", maxWidth: 700, order: 0, enabled: true },
			]);
			expect(
				errors.some((error) => error.code === "EDITOR_BREAKPOINT_INVALID"),
				`id ${JSON.stringify(id)}`,
			).toBe(true);
		}
	});

	it("rejects a duplicate id", () => {
		const errors = reject([
			{ id: "a", label: "A", maxWidth: 900, order: 0, enabled: true },
			{ id: "a", label: "A2", maxWidth: 700, order: 1, enabled: true },
		]);
		expect(
			errors.some((error) => error.details?.reason === "duplicate-id"),
		).toBe(true);
	});

	it("rejects a duplicate maxWidth", () => {
		const errors = reject([
			{ id: "a", label: "A", maxWidth: 900, order: 0, enabled: true },
			{ id: "b", label: "B", maxWidth: 900, order: 1, enabled: true },
		]);
		expect(
			errors.some((error) =>
				error.message.includes("duplicate breakpoint maxWidth"),
			),
		).toBe(true);
	});

	it("rejects non-integer and out-of-range widths", () => {
		for (const maxWidth of [700.5, 0, 100_000, Number.NaN]) {
			const errors = reject([
				{ id: "a", label: "A", maxWidth, order: 0, enabled: true },
			]);
			expect(
				errors.some((error) => error.code === "EDITOR_BREAKPOINT_INVALID"),
				`maxWidth ${String(maxWidth)}`,
			).toBe(true);
		}
	});

	it("accepts a well-formed set", () => {
		expect(
			reject([
				{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
			]),
		).toEqual([]);
	});
});

describe("resolver precedence and diagnostic edges (§24.3)", () => {
	const BPS = [
		{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
	];
	const tokenOf = (patch: Record<string, unknown>) =>
		({
			path: ["group", patch.id],
			name: patch.id,
			type: "color",
			values: {},
			...patch,
		}) as never;

	it("treats an explicitly null override as absent, not as a value", () => {
		// `null` at a layer means "nothing authored here", so the wider
		// layer must win — the alternative (treating null as a value)
		// would blank the property at that breakpoint.
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			breakpoints: BPS,
			nodes: {
				n1: {
					layout: { base: { gap: px(4) }, overrides: { tablet: null } },
				} as never,
			},
		};
		const resolved = resolveNodeAuthoring("n1", {
			authoring: state,
			breakpoints: BPS,
			viewportWidth: 800,
			tokenMode: "light",
		});
		expect(resolved.layout.gap).toEqual(px(4));
	});

	it("resolves no style definitions when styleRefs has no active layer", () => {
		// `styleRefs` exists but neither base nor a matching override
		// applies at this viewport — the ref list is simply empty.
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			breakpoints: BPS,
			nodes: {
				n1: { styleRefs: { overrides: { tablet: ["sd-a"] } } } as never,
			},
		};
		const resolved = resolveNodeAuthoring("n1", {
			authoring: state,
			breakpoints: BPS,
			// Wider than the tablet ceiling, so the override does not match.
			viewportWidth: 1400,
			tokenMode: "light",
		});
		expect(resolved.diagnostics).toEqual([]);
		expect(resolved.layout).toEqual({});
	});

	it("reports a token alias cycle as a warning and keeps the ref", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			tokens: {
				a: tokenOf({ id: "a", values: { light: { kind: "alias", tokenId: "b" } } }),
				b: tokenOf({ id: "b", values: { light: { kind: "alias", tokenId: "a" } } }),
			},
			tokenModes: { light: { id: "light", name: "Light" } } as never,
			nodes: {
				n1: {
					typography: { base: { color: { kind: "token", tokenId: "a" } } },
				} as never,
			},
		};
		const resolved = resolveNodeAuthoring("n1", {
			authoring: state,
			breakpoints: [],
			viewportWidth: 1200,
			tokenMode: "light",
		});
		// The ref survives so the author still sees which token broke.
		expect(resolved.typography.color).toEqual({
			kind: "token",
			tokenId: "a",
		});
		const cycle = resolved.diagnostics.find(
			(error) => error.code === "EDITOR_TOKEN_CYCLE",
		);
		expect(cycle?.severity).toBe("warning");
	});

	it("reports an incompatible alias type as a warning", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			tokens: {
				size: tokenOf({
					id: "size",
					type: "length",
					values: { light: { kind: "literal", value: px(8) } },
				}),
				bad: tokenOf({
					id: "bad",
					type: "color",
					values: { light: { kind: "alias", tokenId: "size" } },
				}),
			},
			tokenModes: { light: { id: "light", name: "Light" } } as never,
			nodes: {
				n1: {
					typography: { base: { color: { kind: "token", tokenId: "bad" } } },
				} as never,
			},
		};
		const resolved = resolveNodeAuthoring("n1", {
			authoring: state,
			breakpoints: [],
			viewportWidth: 1200,
			tokenMode: "light",
		});
		const mismatch = resolved.diagnostics.find(
			(error) => error.details?.reason === "token-type-mismatch",
		);
		expect(mismatch?.code).toBe("EDITOR_INVALID_CSS_VALUE");
		expect(mismatch?.severity).toBe("warning");
	});

	it("skips explicitly undefined keys when merging layers", () => {
		// An override object may carry `key: undefined` (a spread of an
		// optional field). That must not erase the lower layer's value.
		expect(
			mergePropertyWise<{ gap?: unknown; rowGap?: unknown }>(
				{ gap: px(4), rowGap: px(2) },
				{ gap: undefined, rowGap: px(9) },
			),
		).toEqual({ gap: px(4), rowGap: px(9) });
	});
});

describe("entity validation rejects invalid and over-cap writes", () => {
	function tokenCreate(token: unknown) {
		return validateEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "token.create",
			token: token as never,
		});
	}

	it("rejects a token that fails its schema", () => {
		const errors = tokenCreate({ id: "t1", type: "not-a-type", values: {} });
		expect(
			errors.some((error) => error.code === "EDITOR_INVALID_CSS_VALUE"),
		).toBe(true);
		expect(errors[0]?.details?.kind).toBe("token");
	});

	it("rejects a token beyond the frozen §7.3 token cap", () => {
		const tokens: Record<string, unknown> = {};
		for (let index = 0; index < 2000; index += 1) {
			tokens[`t${index}`] = {
				id: `t${index}`,
				path: ["group", `t${index}`],
				name: `t${index}`,
				type: "color",
				values: {},
			};
		}
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			tokens: tokens as never,
		};
		const errors = validateEditorCommand(state, {
			...base(0),
			type: "token.create",
			token: {
				id: "overflow",
				path: ["group", "overflow"],
				name: "overflow",
				type: "color",
				values: {},
			} as never,
		});
		expect(errors.some((error) => error.code === "EDITOR_LIMIT_EXCEEDED")).toBe(
			true,
		);
	});

	it("rejects a style definition that fails its schema", () => {
		const errors = validateEditorCommand(createEmptyAuthoringState(), {
			...base(0),
			type: "styleDefinition.create",
			definition: {
				version: "1",
				id: "sd-bad",
				name: "bad",
				// `appliesTo` is a closed union; this is not a member.
				appliesTo: "nonsense",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			} as never,
		});
		expect(
			errors.some((error) => error.code === "EDITOR_INVALID_CSS_VALUE"),
		).toBe(true);
		expect(
			errors.some((error) => error.details?.kind === "styleDefinition"),
		).toBe(true);
	});

	it("rejects a style definition beyond the frozen §7.3 cap", () => {
		const definitions: Record<string, unknown> = {};
		for (let index = 0; index < 1000; index += 1) {
			definitions[`sd${index}`] = {
				version: "1",
				id: `sd${index}`,
				name: `sd${index}`,
				appliesTo: "any",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			};
		}
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			styleDefinitions: definitions as never,
		};
		const errors = validateEditorCommand(state, {
			...base(0),
			type: "styleDefinition.create",
			definition: {
				version: "1",
				id: "overflow",
				name: "overflow",
				appliesTo: "any",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			} as never,
		});
		expect(errors.some((error) => error.code === "EDITOR_LIMIT_EXCEEDED")).toBe(
			true,
		);
	});
});
