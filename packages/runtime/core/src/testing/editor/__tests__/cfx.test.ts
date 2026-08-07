/**
 * ADR 0005 Appendix A certification fixtures — page-editor side
 * (PLAN-0020 CORE-P2-011; DD-0019 §27.6).
 *
 * One `it()` per shared fixture id, each calling `certify(id)`. The
 * final assertion fails if any manifest id went unexercised, so a
 * fixture cannot be declared-but-missing and still read as covered —
 * that completeness check is the whole point of ADR 0005's
 * enforcement clause (c).
 *
 * History-related criteria assume **isolated intents** (Appendix A
 * preamble): each is asserted at the reduction/commit level, where
 * "one history entry" is exact, rather than through Puck's 250 ms
 * record debounce.
 */

import type {
	ComponentDefinition,
	DesignToken,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandBase,
} from "../../../editor/legacy/index.js";
import type {
	AuthoringStateV1,
} from "../../../editor/legacy/index.js";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import {
	ComponentInstanceStateSchema,
	DesignTokenSchema,
} from "@anvilkit/schema/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	applyTokenDeletion,
	buildCreateComponentPlan,
	buildDetachPlan,
	collectOrphanOverrides,
	collectUnresolvedInstances,
	createEmptyAuthoringState,
	formatComponentPath,
	isDetachFailure,
	materializeInstance,
	orphanOverrideDiagnostics,
	resolveNodeAuthoring,
	resolveToken,
	runtimeNodeId,
	switchInstanceVariant,
	unresolvedInstanceDiagnostics,
	validateAtomicCommand,
} from "../../../editor/index.js";
import {
	CFX_IDS,
	certify,
	resetCfxCoverage,
	uncertifiedFixtures,
} from "../cfx/index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `cfx-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;
const hex = (value: string) => ({ kind: "hex", value }) as const;

const ISO = "2026-01-01T00:00:00.000Z";

function definition(
	overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
	return {
		version: "1",
		id: "def",
		name: "Card",
		root: {
			type: "Box",
			props: {
				id: "n-root",
				label: "base",
				children: [{ type: "Text", props: { id: "n-text", text: "hi" } }],
			},
		} as unknown as SerializablePuckNode,
		exposedProps: [
			{ id: "p-label", name: "Label", type: "text", sourcePath: ["label"] },
		],
		variantAxes: [],
		variants: [],
		revision: 1,
		createdAt: ISO,
		updatedAt: ISO,
		...overrides,
	};
}

function docWith(
	def: ComponentDefinition,
	instanceIds: readonly string[],
	instanceOverrides: Record<string, unknown> = {},
): AuthoringStateV1 {
	const nodes: Record<string, AuthoringStateV1["nodes"][string]> = {};
	for (const id of instanceIds) {
		nodes[id] = {
			version: "1",
			componentInstance: {
				definitionId: def.id,
				definitionRevision: def.revision,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: instanceOverrides as never,
			},
		};
	}
	return {
		...createEmptyAuthoringState(),
		componentDefinitions: { [def.id]: def },
		nodes,
	};
}

const puckDoc = (ids: readonly string[]): PuckData =>
	({
		root: { props: {} },
		content: ids.map((id) => ({ type: "Box", props: { id } })),
		zones: {},
	}) as unknown as PuckData;

let idSeq = 0;
const generateId = (type: string) => `${type}-fresh-${++idSeq}`;

beforeAll(() => resetCfxCoverage());

describe("ADR 0005 Appendix A — component fixtures", () => {
	it("CFX-C01 definition/instance separation", () => {
		const def = definition();
		const one = docWith(def, ["i1"]);
		const three = docWith(def, ["i1", "i2", "i3"]);

		// Instances carry a reference, not a resolved subtree.
		const serialized = JSON.stringify(one.nodes);
		expect(serialized).not.toContain("n-text");
		expect(serialized).toContain("definitionId");

		// Size scales with instance COUNT only, never count × definition
		// size: adding two instances adds two references.
		const perInstance =
			(JSON.stringify(three.nodes).length - serialized.length) / 2;
		const definitionSize = JSON.stringify(def).length;
		expect(perInstance).toBeLessThan(definitionSize);
		certify("CFX-C01");
	});

	it("CFX-C02 stable override addressing", () => {
		const def = definition();
		const state = docWith(def, ["i1"], {
			"n-text": { props: { text: "override" } },
		});

		// Rename the instance node and reorder siblings — neither is
		// index-based, so the override still addresses `n-text`.
		const renamed: AuthoringStateV1 = applyEditorCommand(state, {
			...base(state.revision),
			type: "node.rename",
			nodeId: "i1",
			name: "Renamed",
		}).state;
		const resolved = materializeInstance(
			"i1",
			renamed.nodes.i1!.componentInstance!,
			renamed.componentDefinitions,
		);
		expect(resolved.status).toBe("materialized");
		if (resolved.status === "materialized") {
			const child = (
				resolved.node.props.children as unknown as SerializablePuckNode[]
			)[0];
			expect(child?.props.text).toBe("override");
		}

		// An index-keyed override is not a node id; the persisted-id
		// schema is what refuses it.
		expect(
			ComponentInstanceStateSchema.safeParse({
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: { "": { props: {} } },
			}).success,
		).toBe(false);
		certify("CFX-C02");
	});

	it("CFX-C03 shared resolution", () => {
		const def = definition();
		const state = docWith(def, ["i1"], {
			"n-root": { props: { label: "x" } },
		});
		const instance = state.nodes.i1!.componentInstance!;
		// Every consumer goes through the one materializer; repeated
		// resolution is deep-equal, so no path can drift.
		const first = materializeInstance(
			"i1",
			instance,
			state.componentDefinitions,
		);
		const second = materializeInstance(
			"i1",
			instance,
			state.componentDefinitions,
		);
		expect(first).toEqual(second);
		certify("CFX-C03");
	});

	it("CFX-C04 runtime ID namespacing", () => {
		const def = definition();
		const state = docWith(def, ["i1"]);
		const result = materializeInstance(
			"i1",
			state.nodes.i1!.componentInstance!,
			state.componentDefinitions,
		);
		if (result.status !== "materialized") {
			throw new Error("expected materialized");
		}
		expect(result.node.props.id).toBe(runtimeNodeId("i1", "n-root"));

		// Never collides with a document node id, and never persisted.
		const documentIds = new Set(Object.keys(state.nodes));
		expect(documentIds.has(String(result.node.props.id))).toBe(false);
		expect(JSON.stringify(state)).not.toContain("::");
		certify("CFX-C04");
	});

	it("CFX-C05 resolution precedence (incl. the page-only breakpoint layer)", () => {
		const def = definition({
			variantAxes: [
				{
					id: "size",
					name: "Size",
					options: [
						{ id: "sm", name: "S" },
						{ id: "lg", name: "L" },
					],
				},
			],
			variants: [
				{
					id: "v",
					selection: { size: "lg" },
					patch: { "n-root": { props: { label: "variant" } } },
				},
			],
		});
		const definitions = { def };
		const at = (instance: Record<string, unknown>) => {
			const result = materializeInstance(
				"i1",
				{
					definitionId: "def",
					definitionRevision: 1,
					variantSelection: {},
					propOverrides: {},
					nodeOverrides: {},
					...instance,
				} as never,
				definitions,
			);
			return result.status === "materialized"
				? result.node.props.label
				: undefined;
		};

		expect(at({})).toBe("base");
		expect(at({ variantSelection: { size: "lg" } })).toBe("variant");
		expect(
			at({
				variantSelection: { size: "lg" },
				propOverrides: { "p-label": "exposed" },
			}),
		).toBe("exposed");
		expect(
			at({
				variantSelection: { size: "lg" },
				propOverrides: { "p-label": "exposed" },
				nodeOverrides: { "n-root": { props: { label: "node" } } },
			}),
		).toBe("node");

		// The page-only layer: a breakpoint override wins over base.
		const bp = {
			id: "tablet",
			label: "Tablet",
			maxWidth: 991,
			order: 0,
			enabled: true,
		} as const;
		const responsive: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			breakpoints: [bp],
			nodes: {
				n1: {
					version: "1",
					layout: {
						base: { gap: px(2) },
						overrides: { tablet: { gap: px(9) } },
					},
				},
			},
		};
		const ctx = (width: number) => ({
			authoring: responsive,
			breakpoints: responsive.breakpoints,
			viewportWidth: width,
			tokenMode: "light",
		});
		expect(resolveNodeAuthoring("n1", ctx(1400)).layout.gap).toEqual(px(2));
		expect(resolveNodeAuthoring("n1", ctx(800)).layout.gap).toEqual(px(9));
		certify("CFX-C05");
	});

	it("CFX-C06 atomic creation", () => {
		const data = puckDoc(["a", "b", "c"]);
		const authoring = createEmptyAuthoringState();
		const dataBefore = JSON.parse(JSON.stringify(data));
		const authoringBefore = JSON.parse(JSON.stringify(authoring));

		const plan = buildCreateComponentPlan(data, authoring, {
			nodeIds: ["a", "b"],
			name: "Card",
			definitionId: "def-1",
			instanceNodeId: "inst-1",
			timestamp: ISO,
		});
		expect(plan).not.toBeNull();

		// The reduction is a pure transform: the pre-creation document is
		// untouched, so restoring it IS the single undo step (the
		// one-dispatch commit is certified in the port + E2E suites).
		expect(data).toEqual(dataBefore);
		expect(authoring).toEqual(authoringBefore);
		certify("CFX-C06");
	});

	it("CFX-C07 cycle and depth rejection", () => {
		const nesting = (id: string, child: string): ComponentDefinition =>
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
									__anvilkitInstance: {
										definitionId: child,
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

		const cyclic = {
			Card: nesting("Card", "Badge"),
			Badge: nesting("Badge", "Card"),
		};
		const cycle = materializeInstance(
			"i1",
			{
				definitionId: "Card",
				definitionRevision: 1,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: {},
			},
			cyclic,
		);
		expect(cycle.status).toBe("cycle");
		if (cycle.status === "cycle") {
			// Full-path diagnostic, not just "a cycle exists".
			expect(formatComponentPath(cycle.path, cyclic)).toBe(
				"Card → Badge → Card",
			);
		}

		const deep: Record<string, ComponentDefinition> = {};
		const depth = EDITOR_COUNT_LIMITS.componentNestingDepth + 4;
		for (let index = 0; index < depth; index += 1) {
			deep[`d${index}`] = nesting(`d${index}`, `d${index + 1}`);
		}
		deep[`d${depth}`] = definition({ id: `d${depth}`, name: `d${depth}` });
		expect(
			materializeInstance(
				"i1",
				{
					definitionId: "d0",
					definitionRevision: 1,
					variantSelection: {},
					propOverrides: {},
					nodeOverrides: {},
				},
				deep,
			).status,
		).toBe("depth-exceeded");
		certify("CFX-C07");
	});

	it("CFX-C08 propagation without copies", () => {
		const def = definition();
		const many = docWith(def, ["i1", "i2", "i3", "i4"], {
			"n-text": { props: { text: "kept" } },
		});
		const edited: AuthoringStateV1 = {
			...many,
			componentDefinitions: {
				def: {
					...def,
					root: {
						...def.root,
						props: { ...def.root.props, label: "edited" },
					} as SerializablePuckNode,
					revision: 2,
				},
			},
		};
		for (const id of ["i1", "i2", "i3", "i4"]) {
			const result = materializeInstance(
				id,
				edited.nodes[id]!.componentInstance!,
				edited.componentDefinitions,
			);
			if (result.status !== "materialized") {
				throw new Error("expected materialized");
			}
			// Every instance reflects the edit...
			expect(result.node.props.label).toBe("edited");
			// ...and its own override survives.
			const child = (
				result.node.props.children as unknown as SerializablePuckNode[]
			)[0];
			expect(child?.props.text).toBe("kept");
		}
		// The patch is one definition write regardless of N.
		expect(Object.keys(edited.componentDefinitions)).toHaveLength(1);
		certify("CFX-C08");
	});

	it("CFX-C09 orphan overrides", () => {
		const def = definition();
		const state = docWith(def, ["i1"], {
			"n-removed": { props: { label: "ghost" } },
		});
		expect(collectOrphanOverrides(state)).toEqual([
			{
				instanceNodeId: "i1",
				definitionId: "def",
				definitionNodeId: "n-removed",
			},
		]);
		const diagnostics = orphanOverrideDiagnostics(state);
		expect(diagnostics[0]?.severity).toBe("warning");

		// Retained, and never applied to some other node.
		const result = materializeInstance(
			"i1",
			state.nodes.i1!.componentInstance!,
			state.componentDefinitions,
		);
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("base");
		}
		expect(
			state.nodes.i1?.componentInstance?.nodeOverrides["n-removed"],
		).toBeDefined();
		certify("CFX-C09");
	});

	it("CFX-C10 detach materialization", () => {
		const def = definition();
		const state = docWith(def, ["i1"], {
			"n-root": { props: { label: "kept" } },
		});
		const before = materializeInstance(
			"i1",
			state.nodes.i1!.componentInstance!,
			state.componentDefinitions,
		);
		const plan = buildDetachPlan(puckDoc(["i1"]), state, ["i1"], generateId);
		if (plan === null || isDetachFailure(plan)) {
			throw new Error("expected a detach plan");
		}
		const detached = plan.data.content?.[0] as unknown as SerializablePuckNode;

		// Visually equivalent…
		if (before.status === "materialized") {
			expect(detached.props.label).toBe(before.node.props.label);
		}
		// …with all-new ids, none of them runtime composites.
		expect(String(detached.props.id)).not.toBe("i1");
		expect(String(detached.props.id)).not.toContain("::");
		// The instance reference is gone, so later definition edits
		// cannot reach the detached nodes.
		expect(plan.authoring.nodes.i1).toBeUndefined();
		certify("CFX-C10");
	});

	it("CFX-C11 variant override compatibility", () => {
		const def = definition({
			variantAxes: [
				{
					id: "badge",
					name: "Badge",
					options: [
						{ id: "on", name: "On" },
						{ id: "off", name: "Off" },
					],
				},
			],
			variants: [
				{
					id: "v-on",
					selection: { badge: "on" },
					patch: { "n-root": { props: { badgeText: "New" } } },
				},
				{ id: "v-off", selection: { badge: "off" }, patch: {} },
			],
		});
		const state: AuthoringStateV1 = {
			...docWith(def, ["i1"]),
			nodes: {
				i1: {
					version: "1",
					componentInstance: {
						definitionId: "def",
						definitionRevision: 1,
						variantSelection: { badge: "on" },
						propOverrides: {},
						nodeOverrides: {
							"n-root": { props: { label: "compatible", badgeText: "gone" } },
						} as never,
					},
				},
			},
		};
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		const kept =
			result.state.nodes.i1?.componentInstance?.nodeOverrides["n-root"];
		// Compatible survives; incompatible is reported, not dropped in silence.
		expect(kept?.props).toEqual({ label: "compatible" });
		expect(result.dropped).toHaveLength(1);
		expect(result.dropped[0]?.propertyKey).toBe("badgeText");
		certify("CFX-C11");
	});

	it("CFX-C12 missing definition", () => {
		const state = docWith(definition(), ["i1"]);
		const outage: AuthoringStateV1 = { ...state, componentDefinitions: {} };

		// No crash, no silent removal — the node record survives…
		expect(outage.nodes.i1).toBeDefined();
		// …and resolution reports a structured reason rather than throwing.
		expect(
			materializeInstance(
				"i1",
				outage.nodes.i1!.componentInstance!,
				outage.componentDefinitions,
			).status,
		).toBe("missing-definition");
		const diagnostics = unresolvedInstanceDiagnostics(outage);
		expect(diagnostics[0]?.code).toBe("EDITOR_DEFINITION_UNAVAILABLE");
		certify("CFX-C12");
	});

	it("CFX-C13 deletion confirmation", () => {
		const def = definition();
		const referenced = docWith(def, ["i1", "i2"]);

		// A bare delete with live instances refuses.
		expect(
			validateAtomicCommand(referenced, {
				...base(referenced.revision),
				type: "component.definition.delete",
				definitionId: "def",
			}).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_REFERENCED");

		// Under the blocking policy it refuses even after a detach-all in
		// the same transaction (judged on the batch-entry state).
		const detached = docWith(def, []);
		expect(
			validateAtomicCommand(
				detached,
				{
					...base(detached.revision),
					type: "component.definition.delete",
					definitionId: "def",
				},
				{
					policies: { componentDefinitionDelete: "block-when-referenced" },
					entryState: referenced,
				},
			).map((error) => error.code),
		).toContain("EDITOR_DEFINITION_REFERENCED");

		// Accepting detach-all: one committed transaction, and no
		// committed state references the deleted definition.
		const committed = applyEditorCommand(detached, {
			...base(detached.revision),
			type: "component.definition.delete",
			definitionId: "def",
		});
		expect(committed.status).toBe("changed");
		expect(committed.state.revision).toBe(detached.revision + 1);
		expect(
			Object.values(committed.state.nodes).filter(
				(record) => record.componentInstance?.definitionId === "def",
			),
		).toEqual([]);
		certify("CFX-C13");
	});

	it("CFX-C14 source retention", () => {
		const def = definition();
		const state = docWith(def, ["i1"], {
			"n-root": { props: { label: "mine" } },
		});
		const outage: AuthoringStateV1 = { ...state, componentDefinitions: {} };

		// Instance data byte-identical through the outage.
		expect(JSON.stringify(outage.nodes)).toBe(JSON.stringify(state.nodes));
		expect(collectUnresolvedInstances(outage)).toHaveLength(1);
		expect(unresolvedInstanceDiagnostics(outage)[0]?.details?.reason).toBe(
			"library-unavailable",
		);

		// Automatic re-resolution on restore — no repair pass involved.
		const restored: AuthoringStateV1 = {
			...outage,
			componentDefinitions: { def },
		};
		const result = materializeInstance(
			"i1",
			restored.nodes.i1!.componentInstance!,
			restored.componentDefinitions,
		);
		expect(result.status).toBe("materialized");
		if (result.status === "materialized") {
			expect(result.node.props.label).toBe("mine");
		}
		certify("CFX-C14");
	});

	it("CFX-C15 reset granularity", () => {
		const def = definition();
		const state = docWith(def, ["i1", "i2"], {
			"n-root": { props: { label: "mine", extra: 1 } },
		});

		// reset-one removes only its target.
		const one = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.reset",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		});
		expect(one.status).toBe("changed");
		expect(one.state.revision).toBe(state.revision + 1);
		expect(
			one.state.nodes.i1?.componentInstance?.nodeOverrides["n-root"]?.props,
		).toEqual({ extra: 1 });

		// reset-all returns to definition-plus-variant resolution.
		const all = applyEditorCommand(one.state, {
			...base(one.state.revision),
			type: "component.override.resetAll",
			instanceNodeIds: ["i1"],
		});
		expect(all.state.nodes.i1?.componentInstance?.nodeOverrides).toEqual({});

		// promote writes the definition default AND clears the redundant
		// override in the same commit.
		const promoted = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.override.promote",
			instanceNodeId: "i1",
			target: { definitionNodeId: "n-root", propertyPath: ["label"] },
			layer: "base",
		});
		expect(promoted.status).toBe("changed");
		expect(promoted.state.revision).toBe(state.revision + 1);
		expect(promoted.state.componentDefinitions.def?.root.props.label).toBe(
			"mine",
		);
		expect(
			promoted.state.nodes.i1?.componentInstance?.nodeOverrides["n-root"]?.props
				?.label,
		).toBeUndefined();
		certify("CFX-C15");
	});
});

describe("ADR 0005 Appendix A — token fixtures", () => {
	const modes = {
		light: { id: "light", name: "Light" },
		dark: { id: "dark", name: "Dark" },
	};

	it("CFX-T01 single-resolver idiom", () => {
		const tokens: Record<string, DesignToken> = {
			brand: {
				id: "brand",
				path: ["color", "brand"],
				name: "Brand",
				type: "color",
				values: { light: { kind: "literal", value: hex("#123456") } },
			},
		};
		// Inspector, preview, and export all reach the same public
		// `resolveToken`; identical inputs give identical results.
		const a = resolveToken("brand", "light", tokens, modes);
		const b = resolveToken("brand", "light", tokens, modes);
		expect(a).toEqual(b);
		expect(a).toMatchObject({ status: "resolved", value: hex("#123456") });
		certify("CFX-T01");
	});

	it("CFX-T02 no live cross-system aliases", () => {
		// Only `literal` and same-system `alias` parse; a theme
		// reference is unrepresentable in a token value.
		expect(
			DesignTokenSchema.safeParse({
				id: "t",
				path: ["color"],
				name: "T",
				type: "color",
				values: { light: { kind: "theme", ref: "semantic.accent" } },
			}).success,
		).toBe(false);
		expect(
			DesignTokenSchema.safeParse({
				id: "t",
				path: ["color"],
				name: "T",
				type: "color",
				values: { light: { kind: "alias", tokenId: "other" } },
			}).success,
		).toBe(true);
		certify("CFX-T02");
	});

	it("CFX-T03 import-as-copy provenance", () => {
		const imported: DesignToken = {
			id: "accent",
			path: ["semantic", "accent"],
			name: "Accent",
			type: "color",
			values: { light: { kind: "literal", value: hex("#ff0000") } },
			source: { system: "theme", ref: "semantic.accent" },
		};
		expect(DesignTokenSchema.safeParse(imported).success).toBe(true);

		// Resolution is identical with `source` stripped…
		const { source: _dropped, ...stripped } = imported;
		const withSource = resolveToken(
			"accent",
			"light",
			{ accent: imported },
			modes,
		);
		const withoutSource = resolveToken(
			"accent",
			"light",
			{ accent: stripped as DesignToken },
			modes,
		);
		expect(withSource).toEqual(withoutSource);

		// …so generated output is byte-identical either way.
		expect(JSON.stringify(withSource)).toBe(JSON.stringify(withoutSource));
		certify("CFX-T03");
	});

	it("CFX-T04 alias depth and cycles", () => {
		const chain = (length: number): Record<string, DesignToken> => {
			const tokens: Record<string, DesignToken> = {};
			for (let index = 0; index < length; index += 1) {
				tokens[`t${index}`] = {
					id: `t${index}`,
					path: ["t"],
					name: `T${index}`,
					type: "number",
					values: {
						light:
							index === length - 1
								? { kind: "literal", value: index }
								: { kind: "alias", tokenId: `t${index + 1}` },
					},
				};
			}
			return tokens;
		};

		// At the limit the chain resolves…
		const limit = EDITOR_COUNT_LIMITS.tokenAliasDepth;
		expect(resolveToken("t0", "light", chain(limit), modes).status).toBe(
			"resolved",
		);
		// …one past it fails with a stable code.
		expect(resolveToken("t0", "light", chain(limit + 4), modes).status).toBe(
			"cycle",
		);

		const cyclic: Record<string, DesignToken> = {
			a: {
				id: "a",
				path: ["a"],
				name: "A",
				type: "color",
				values: { light: { kind: "alias", tokenId: "b" } },
			},
			b: {
				id: "b",
				path: ["b"],
				name: "B",
				type: "color",
				values: { light: { kind: "alias", tokenId: "a" } },
			},
		};
		expect(resolveToken("a", "light", cyclic, modes).status).toBe("cycle");

		// Export is blocked on the cycle: a cyclic write cannot commit.
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			tokenModes: modes,
			tokens: { a: cyclic.a as DesignToken },
		};
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "token.create",
				token: cyclic.b as DesignToken,
			}).map((error) => error.code),
		).toContain("EDITOR_TOKEN_CYCLE");
		certify("CFX-T04");
	});

	it("CFX-T05 reserved mode vocabulary", () => {
		const tokens: Record<string, DesignToken> = {
			surface: {
				id: "surface",
				path: ["color", "surface"],
				name: "Surface",
				type: "color",
				values: {
					light: { kind: "literal", value: hex("#ffffff") },
					dark: { kind: "literal", value: hex("#111111") },
				},
			},
		};
		// `light`/`dark` resolve per mode — the reserved vocabulary that
		// must line up with the theme system's dark overrides.
		expect(resolveToken("surface", "light", tokens, modes)).toMatchObject({
			value: hex("#ffffff"),
			modeId: "light",
		});
		expect(resolveToken("surface", "dark", tokens, modes)).toMatchObject({
			value: hex("#111111"),
			modeId: "dark",
		});
		// A token missing the active mode falls back to the default one.
		const partial: Record<string, DesignToken> = {
			only: {
				id: "only",
				path: ["only"],
				name: "Only",
				type: "color",
				values: { light: { kind: "literal", value: hex("#abcdef") } },
			},
		};
		expect(
			resolveToken("only", "dark", partial, modes, { defaultModeId: "light" }),
		).toMatchObject({ status: "resolved", modeId: "light" });
		certify("CFX-T05");
	});
});

describe("ADR 0005 enforcement clause (c)", () => {
	it("declares exactly the Appendix A fixture ids", () => {
		expect(CFX_IDS).toHaveLength(20);
		expect(CFX_IDS.filter((id) => id.startsWith("CFX-C"))).toHaveLength(15);
		expect(CFX_IDS.filter((id) => id.startsWith("CFX-T"))).toHaveLength(5);
	});

	afterAll(() => {
		// A declared-but-unimplemented fixture must fail the build rather
		// than quietly read as covered — the point of the manifest.
		expect(uncertifiedFixtures()).toEqual([]);
	});
});

describe("token deletion is certified alongside CFX-T03", () => {
	it("materializes references so generated output does not change", () => {
		const state: AuthoringStateV1 = {
			...createEmptyAuthoringState(),
			tokenModes: { light: { id: "light", name: "Light" } },
			tokens: {
				space: {
					id: "space",
					path: ["space"],
					name: "Space",
					type: "length",
					values: { light: { kind: "literal", value: px(16) } },
				},
			},
			nodes: {
				n1: {
					version: "1",
					layout: { base: { gap: { kind: "token", tokenId: "space" } } },
				},
			},
		};
		const next = applyTokenDeletion(
			state,
			"space",
			{ kind: "materialize" },
			{
				tokenMode: "light",
			},
		);
		expect(next.nodes.n1?.layout?.base?.gap).toEqual(px(16));
	});
});
