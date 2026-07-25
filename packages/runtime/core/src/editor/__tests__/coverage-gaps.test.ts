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
