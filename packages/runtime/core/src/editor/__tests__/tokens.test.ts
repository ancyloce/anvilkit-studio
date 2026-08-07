/**
 * Token store: CRUD, aliases, modes, usage tracking, and deletion
 * planning (PLAN-0020 CORE-P2-001; ED-TOKEN-001..003; DD-0019 §15.1,
 * §24.5).
 */

import type {
	DesignToken,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandBase,
} from "../legacy/index.js";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { describe, expect, it } from "vitest";
import {
	aliasDependents,
	applyEditorCommand,
	applyTokenDeletion,
	collectTokenUsage,
	createEmptyAuthoringState,
	mapAuthoringTokens,
	planTokenDeletion,
	resolveAuthoringStyle,
	resolveNodeAuthoring,
	resolveToken,
	tokenUsageSites,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `tok-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;
const hex = (value: string) => ({ kind: "hex", value }) as const;

function token(partial: Partial<DesignToken> & Pick<DesignToken, "id">) {
	return {
		path: ["group", partial.id],
		name: partial.id,
		type: "color",
		values: {},
		...partial,
	} as DesignToken;
}

/** A document exercising every site kind the walk must reach. */
function documentWithTokenRefs(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [
			{ id: "tablet", label: "Tablet", maxWidth: 991, order: 0, enabled: true },
		],
		tokenModes: {
			light: { id: "light", name: "Light" },
			dark: { id: "dark", name: "Dark" },
		},
		tokens: {
			space: token({
				id: "space",
				type: "length",
				values: { light: { kind: "literal", value: px(16) } },
			}),
			brand: token({
				id: "brand",
				type: "color",
				values: { light: { kind: "literal", value: hex("#123456") } },
			}),
			brandAlias: token({
				id: "brandAlias",
				type: "color",
				values: { light: { kind: "alias", tokenId: "brand" } },
			}),
		},
		styleDefinitions: {
			card: {
				version: "1",
				id: "card",
				name: "Card",
				appliesTo: "any",
				layout: { base: { gap: { kind: "token", tokenId: "space" } } },
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		},
		componentDefinitions: {
			badge: {
				version: "1",
				id: "badge",
				name: "Badge",
				root: { type: "Badge", props: {} },
				exposedProps: [],
				variantAxes: [],
				variants: [
					{
						id: "v1",
						selection: {},
						patch: {
							"def-node": {
								typography: {
									base: { color: { kind: "token", tokenId: "brand" } },
								},
							},
						},
					},
				],
				revision: 1,
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			},
		},
		nodes: {
			"node-a": {
				version: "1",
				layout: {
					base: { gap: { kind: "token", tokenId: "space" } },
					overrides: {
						tablet: { padding: { top: { kind: "token", tokenId: "space" } } },
					},
				},
				typography: {
					base: { color: { kind: "token", tokenId: "brand" } },
				},
			},
			"node-b": {
				version: "1",
				componentInstance: {
					definitionId: "badge",
					definitionRevision: 1,
					variantSelection: {},
					propOverrides: {},
					nodeOverrides: {
						"def-node": {
							style: {
								base: {
									background: {
										kind: "solid",
										color: { kind: "token", tokenId: "brand" },
									},
								},
							},
						},
					},
				},
			},
		},
	};
}

describe("resolveToken — modes and alias compatibility (§15.1)", () => {
	const modes = {
		light: { id: "light", name: "Light" },
		dark: { id: "dark", name: "Dark" },
	};

	it("falls back to the default mode when the active mode has no value", () => {
		const tokens = {
			brand: token({
				id: "brand",
				values: { light: { kind: "literal", value: hex("#111111") } },
			}),
		};
		expect(resolveToken("brand", "dark", tokens, modes).status).toBe(
			"missing-value",
		);
		const withFallback = resolveToken("brand", "dark", tokens, modes, {
			defaultModeId: "light",
		});
		expect(withFallback).toMatchObject({
			status: "resolved",
			value: hex("#111111"),
			modeId: "light",
		});
	});

	it("prefers the active mode over the fallback", () => {
		const tokens = {
			brand: token({
				id: "brand",
				values: {
					light: { kind: "literal", value: hex("#111111") },
					dark: { kind: "literal", value: hex("#eeeeee") },
				},
			}),
		};
		expect(
			resolveToken("brand", "dark", tokens, modes, { defaultModeId: "light" }),
		).toMatchObject({ value: hex("#eeeeee"), modeId: "dark" });
	});

	it("rejects an alias to a token of an incompatible type", () => {
		const tokens = {
			size: token({
				id: "size",
				type: "length",
				values: { light: { kind: "literal", value: px(8) } },
			}),
			bad: token({
				id: "bad",
				type: "color",
				values: { light: { kind: "alias", tokenId: "size" } },
			}),
		};
		expect(resolveToken("bad", "light", tokens, modes)).toMatchObject({
			status: "type-mismatch",
			tokenId: "bad",
			aliasTokenId: "size",
			expected: "color",
			actual: "length",
		});
	});
});

describe("token substitution by declared type (regression)", () => {
	const context = (state: AuthoringStateV1) => ({
		authoring: state,
		breakpoints: state.breakpoints,
		viewportWidth: 1400,
		tokenMode: "light",
	});

	it("substitutes a length token in place so it still serializes", () => {
		// Regression: a `length` token was wrapped as
		// `{kind:"literal"}`, which `CssLength` has no member for, so
		// `serializeCssLength` fell through its switch and the property
		// was dropped from the emitted style with no diagnostic.
		const state = documentWithTokenRefs();
		const resolved = resolveNodeAuthoring("node-a", context(state));
		expect(resolved.layout.gap).toEqual(px(16));
		const style = resolveAuthoringStyle({
			nodeId: "node-a",
			layout: resolved.layout,
		});
		expect(style.inlineStyle.gap).toBe("16px");
	});

	it("keeps the literal wrapper for TokenOrLiteral slots", () => {
		const state = documentWithTokenRefs();
		const resolved = resolveNodeAuthoring("node-a", context(state));
		expect(resolved.typography.color).toEqual({
			kind: "literal",
			value: hex("#123456"),
		});
		const style = resolveAuthoringStyle({
			nodeId: "node-a",
			typography: resolved.typography,
		});
		expect(style.inlineStyle.color).toBe("#123456");
	});

	it("keeps the reference and warns when a token cannot be resolved", () => {
		const state = documentWithTokenRefs();
		const missing: AuthoringStateV1 = {
			...state,
			tokens: { ...state.tokens, space: undefined as unknown as DesignToken },
		};
		delete (missing.tokens as Record<string, unknown>).space;
		const resolved = resolveNodeAuthoring("node-a", context(missing));
		expect(resolved.layout.gap).toEqual({ kind: "token", tokenId: "space" });
		expect(
			resolved.diagnostics.some(
				(error) => error.code === "EDITOR_NODE_NOT_FOUND",
			),
		).toBe(true);
	});
});

describe("collectTokenUsage (ED-TOKEN-002)", () => {
	it("finds references in every site kind", () => {
		const index = collectTokenUsage(documentWithTokenRefs());
		const spaceKinds = tokenUsageSites(index, "space").map((site) => site.kind);
		expect(spaceKinds).toContain("node");
		expect(spaceKinds).toContain("styleDefinition");

		const brandSites = tokenUsageSites(index, "brand");
		const brandKinds = brandSites.map((site) => site.kind);
		expect(brandKinds).toContain("node");
		expect(brandKinds).toContain("instanceOverride");
		expect(brandKinds).toContain("componentVariant");
		expect(brandKinds).toContain("tokenAlias");
	});

	it("records the layer a reference was written at", () => {
		const index = collectTokenUsage(documentWithTokenRefs());
		const layers = tokenUsageSites(index, "space")
			.filter((site) => site.kind === "node")
			.map((site) => (site.kind === "node" ? site.layer : undefined));
		expect(layers).toContain("base");
		expect(layers).toContain("tablet");
	});

	it("lists the tokens that alias a token", () => {
		const index = collectTokenUsage(documentWithTokenRefs());
		expect(aliasDependents(index, "brand")).toEqual(["brandAlias"]);
		expect(aliasDependents(index, "space")).toEqual([]);
	});

	it("returns no sites for an unreferenced token", () => {
		const index = collectTokenUsage(documentWithTokenRefs());
		expect(tokenUsageSites(index, "brandAlias")).toEqual([]);
	});

	it("preserves state identity when nothing is rewritten", () => {
		const state = documentWithTokenRefs();
		expect(mapAuthoringTokens(state, () => undefined)).toBe(state);
	});
});

describe("planTokenDeletion (ED-TOKEN-003)", () => {
	it("reports the impact before deletion", () => {
		const plan = planTokenDeletion(
			documentWithTokenRefs(),
			"brand",
			{ kind: "materialize" },
			{ tokenMode: "light" },
		);
		expect(plan.sites.length).toBe(4);
		expect(plan.aliasDependents).toEqual(["brandAlias"]);
		expect(plan.errors).toEqual([]);
	});

	it("rejects a replacement of an incompatible type", () => {
		const plan = planTokenDeletion(
			documentWithTokenRefs(),
			"brand",
			{ kind: "replace", tokenId: "space" },
			{ tokenMode: "light" },
		);
		expect(plan.errors.map((error) => error.details?.reason)).toContain(
			"token-type-mismatch",
		);
	});

	it("rejects self-replacement and unknown tokens", () => {
		const state = documentWithTokenRefs();
		expect(
			planTokenDeletion(
				state,
				"brand",
				{ kind: "replace", tokenId: "brand" },
				{ tokenMode: "light" },
			).errors.map((error) => error.details?.reason),
		).toContain("self-replacement");
		expect(
			planTokenDeletion(
				state,
				"ghost",
				{ kind: "materialize" },
				{
					tokenMode: "light",
				},
			).errors.map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});

	it("warns when a materialized token cannot be resolved in the mode", () => {
		const state = documentWithTokenRefs();
		const plan = planTokenDeletion(
			state,
			"space",
			{ kind: "materialize" },
			{ tokenMode: "dark" },
		);
		expect(
			plan.errors.some(
				(error) => error.details?.reason === "unresolvable-materialization",
			),
		).toBe(true);
		// Advisory only — it must not block the command.
		expect(plan.errors.every((error) => error.severity === "warning")).toBe(
			true,
		);
	});
});

describe("applyTokenDeletion", () => {
	it("materializes references, preserving appearance", () => {
		const state = documentWithTokenRefs();
		const next = applyTokenDeletion(
			state,
			"space",
			{ kind: "materialize" },
			{
				tokenMode: "light",
			},
		);
		expect(next.tokens.space).toBeUndefined();
		// A length token materializes in place — not wrapped.
		expect(next.nodes["node-a"]?.layout?.base?.gap).toEqual(px(16));
		expect(next.nodes["node-a"]?.layout?.overrides?.tablet).toEqual({
			padding: { top: px(16) },
		});
		expect(next.styleDefinitions.card?.layout?.base?.gap).toEqual(px(16));

		const style = resolveAuthoringStyle({
			nodeId: "node-a",
			layout: next.nodes["node-a"]?.layout?.base,
		});
		expect(style.inlineStyle.gap).toBe("16px");
	});

	it("materializes an alias edge into a literal", () => {
		const next = applyTokenDeletion(
			documentWithTokenRefs(),
			"brand",
			{ kind: "materialize" },
			{ tokenMode: "light" },
		);
		expect(next.tokens.brandAlias?.values.light).toEqual({
			kind: "literal",
			value: hex("#123456"),
		});
	});

	it("repoints every reference when replacing", () => {
		const state = documentWithTokenRefs();
		const withSpare: AuthoringStateV1 = {
			...state,
			tokens: {
				...state.tokens,
				accent: token({
					id: "accent",
					type: "color",
					values: { light: { kind: "literal", value: hex("#abcdef") } },
				}),
			},
		};
		const next = applyTokenDeletion(
			withSpare,
			"brand",
			{ kind: "replace", tokenId: "accent" },
			{ tokenMode: "light" },
		);
		expect(next.tokens.brand).toBeUndefined();
		expect(next.nodes["node-a"]?.typography?.base?.color).toEqual({
			kind: "token",
			tokenId: "accent",
		});
		expect(next.tokens.brandAlias?.values.light).toEqual({
			kind: "alias",
			tokenId: "accent",
		});
		expect(
			next.componentDefinitions.badge?.variants[0]?.patch["def-node"]
				?.typography?.base?.color,
		).toEqual({ kind: "token", tokenId: "accent" });
	});

	it("leaves unresolvable references in place rather than dropping them", () => {
		const state = documentWithTokenRefs();
		const next = applyTokenDeletion(
			state,
			"space",
			{ kind: "materialize" },
			{
				tokenMode: "dark",
			},
		);
		expect(next.tokens.space).toBeUndefined();
		expect(next.nodes["node-a"]?.layout?.base?.gap).toEqual({
			kind: "token",
			tokenId: "space",
		});
	});

	it("is a no-op for an unknown token", () => {
		const state = documentWithTokenRefs();
		expect(
			applyTokenDeletion(
				state,
				"ghost",
				{ kind: "materialize" },
				{
					tokenMode: "light",
				},
			),
		).toBe(state);
	});
});

describe("token commands (§27.3)", () => {
	it("creates a token", () => {
		const state = documentWithTokenRefs();
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "token.create",
			token: token({
				id: "radiusSm",
				type: "radius",
				values: { light: { kind: "literal", value: px(4) } },
			}),
		});
		expect(result.status).toBe("changed");
		expect(result.state.tokens.radiusSm).toBeDefined();
		expect(result.state.revision).toBe(state.revision + 1);
	});

	it("rejects a duplicate token id", () => {
		const state = documentWithTokenRefs();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "token.create",
				token: token({ id: "brand" }),
			}).map((error) => error.details?.reason),
		).toContain("duplicate-id");
	});

	it("rejects a create that would introduce an alias cycle", () => {
		const state = documentWithTokenRefs();
		const cyclic: AuthoringStateV1 = {
			...state,
			tokens: {
				...state.tokens,
				brand: token({
					id: "brand",
					type: "color",
					values: { light: { kind: "alias", tokenId: "loop" } },
				}),
			},
		};
		expect(
			validateAtomicCommand(cyclic, {
				...base(cyclic.revision),
				type: "token.create",
				token: token({
					id: "loop",
					type: "color",
					values: { light: { kind: "alias", tokenId: "brand" } },
				}),
			}).map((error) => error.code),
		).toContain("EDITOR_TOKEN_CYCLE");
	});

	it("rejects a create whose alias crosses token types", () => {
		const state = documentWithTokenRefs();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "token.create",
				token: token({
					id: "wrong",
					type: "color",
					values: { light: { kind: "alias", tokenId: "space" } },
				}),
			}).map((error) => error.details?.reason),
		).toContain("token-type-mismatch");
	});

	it("updates a token and rejects unknown ids", () => {
		const state = documentWithTokenRefs();
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "token.update",
			tokenId: "brand",
			patch: { name: "Brand Primary" },
		});
		expect(result.status).toBe("changed");
		expect(result.state.tokens.brand?.name).toBe("Brand Primary");
		expect(result.state.tokens.brand?.id).toBe("brand");

		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "token.update",
				tokenId: "ghost",
				patch: { name: "Nope" },
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});

	it("rejects an update that would introduce a cycle", () => {
		const state = documentWithTokenRefs();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "token.update",
				tokenId: "brand",
				patch: { values: { light: { kind: "alias", tokenId: "brandAlias" } } },
			}).map((error) => error.code),
		).toContain("EDITOR_TOKEN_CYCLE");
	});

	it("deletes a token through the command pipeline", () => {
		const state = documentWithTokenRefs();
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "token.delete",
			tokenId: "space",
			disposition: { kind: "materialize" },
			tokenMode: "light",
		});
		expect(result.status).toBe("changed");
		expect(result.state.tokens.space).toBeUndefined();
		expect(result.state.nodes["node-a"]?.layout?.base?.gap).toEqual(px(16));
	});

	it("rejects a delete with an incompatible replacement", () => {
		const state = documentWithTokenRefs();
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "token.delete",
			tokenId: "brand",
			disposition: { kind: "replace", tokenId: "space" },
			tokenMode: "light",
		});
		expect(result.status).toBe("rejected");
		expect(result.state).toBe(state);
	});

	it("never mutates frozen input", () => {
		const state = documentWithTokenRefs();
		const frozen = JSON.parse(JSON.stringify(state)) as AuthoringStateV1;
		applyEditorCommand(state, {
			...base(state.revision),
			type: "token.delete",
			tokenId: "brand",
			disposition: { kind: "materialize" },
			tokenMode: "light",
		});
		expect(state).toEqual(frozen);
	});
});
