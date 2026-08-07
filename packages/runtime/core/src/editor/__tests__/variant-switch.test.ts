/**
 * Instance variant switching and compatible-override preservation
 * (PLAN-0020 CORE-P2-009C/D; ED-VARIANT-001/002; ADR 0005 VR-001).
 */

import type {
	ComponentDefinition,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandBase,
} from "../legacy/index.js";
import type {
	AuthoringStateV1,
} from "../legacy/index.js";
import { describe, expect, it } from "vitest";
import {
	applyEditorCommand,
	createEmptyAuthoringState,
	droppedOverrideDiagnostics,
	materializeInstance,
	switchInstanceVariant,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `vsw-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

/**
 * `withBadge` adds a `badgeText` prop that no other combination has —
 * the case that makes override compatibility a real question.
 */
const DEFINITION: ComponentDefinition = {
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
		{
			id: "v-off",
			selection: { badge: "off" },
			patch: {},
		},
	],
	revision: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

function doc(
	nodeOverrides: Record<string, unknown> = {},
	selection: Record<string, string> = { badge: "on" },
	extra: readonly string[] = [],
): AuthoringStateV1 {
	const nodes: Record<string, AuthoringStateV1["nodes"][string]> = {
		i1: {
			version: "1",
			componentInstance: {
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: selection,
				propOverrides: { "p-label": "mine" } as never,
				nodeOverrides: nodeOverrides as never,
			},
		},
	};
	for (const id of extra) {
		nodes[id] = {
			version: "1",
			componentInstance: {
				definitionId: "def",
				definitionRevision: 1,
				variantSelection: selection,
				propOverrides: {},
				nodeOverrides: {},
			},
		};
	}
	return {
		...createEmptyAuthoringState(),
		componentDefinitions: { def: DEFINITION },
		nodes,
	};
}

const overridesOf = (state: AuthoringStateV1, id = "i1") =>
	state.nodes[id]?.componentInstance?.nodeOverrides ?? {};

describe("switching (ED-VARIANT-001)", () => {
	it("replaces the selection", () => {
		const state = doc();
		const next = switchInstanceVariant(state, ["i1"], { badge: "off" }).state;
		expect(next.nodes.i1?.componentInstance?.variantSelection).toEqual({
			badge: "off",
		});
	});

	it("renders the newly selected variant", () => {
		const state = doc();
		const next = switchInstanceVariant(state, ["i1"], { badge: "on" }).state;
		const result = materializeInstance(
			"i1",
			next.nodes.i1!.componentInstance!,
			next.componentDefinitions,
		);
		if (result.status !== "materialized") {
			throw new Error("expected materialized");
		}
		expect(result.node.props.badgeText).toBe("New");
	});

	it("switches several instances in one intent", () => {
		const state = doc({}, { badge: "on" }, ["i2"]);
		const result = applyEditorCommand(state, {
			...base(state.revision),
			type: "component.instance.variant.set",
			instanceNodeIds: ["i1", "i2"],
			selection: { badge: "off" },
		});
		expect(result.status).toBe("changed");
		// One transaction, one revision bump (§10.5).
		expect(result.state.revision).toBe(state.revision + 1);
		for (const id of ["i1", "i2"]) {
			expect(
				result.state.nodes[id]?.componentInstance?.variantSelection,
			).toEqual({ badge: "off" });
		}
	});

	it("is a noop when the selection is unchanged", () => {
		const state = doc();
		expect(
			applyEditorCommand(state, {
				...base(state.revision),
				type: "component.instance.variant.set",
				instanceNodeIds: ["i1"],
				selection: { badge: "on" },
			}).status,
		).toBe("noop");
	});
});

describe("compatible-override preservation (ED-VARIANT-002)", () => {
	it("keeps an override whose property exists in the new combination", () => {
		const state = doc({ "n-root": { props: { label: "kept" } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(overridesOf(result.state)["n-root"]).toEqual({
			props: { label: "kept" },
		});
		expect(result.dropped).toEqual([]);
	});

	it("drops an override whose property only exists in the old combination", () => {
		// `badgeText` is introduced by the `on` variant only.
		const state = doc({ "n-root": { props: { badgeText: "custom" } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(overridesOf(result.state)["n-root"]).toBeUndefined();
		expect(result.dropped).toEqual([
			{
				instanceNodeId: "i1",
				definitionNodeId: "n-root",
				propertyKey: "badgeText",
				reason: "property-absent",
			},
		]);
	});

	it("never discards both — compatible siblings survive the drop", () => {
		const state = doc({
			"n-root": { props: { label: "kept", badgeText: "gone" } },
		});
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(overridesOf(result.state)["n-root"]).toEqual({
			props: { label: "kept" },
		});
		expect(result.dropped).toHaveLength(1);
	});

	it("keeps authoring families — they apply to a node that still exists", () => {
		const state = doc({
			"n-root": {
				props: { badgeText: "gone" },
				layout: { base: { gap: px(4) } },
			},
		});
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(overridesOf(result.state)["n-root"]).toEqual({
			layout: { base: { gap: px(4) } },
		});
		expect(result.dropped).toHaveLength(1);
	});

	it("drops the whole entry when the target definition node is absent", () => {
		const state = doc({ "n-gone": { props: { x: 1 } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(overridesOf(result.state)["n-gone"]).toBeUndefined();
		expect(result.dropped[0]?.reason).toBe("node-absent");
	});

	it("preserves exposed-property overrides across every switch", () => {
		// Exposed props are definition-level, so they cannot become
		// incompatible with a combination.
		const state = doc({ "n-root": { props: { badgeText: "gone" } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		expect(result.state.nodes.i1?.componentInstance?.propOverrides).toEqual({
			"p-label": "mine",
		});
	});

	it("reports every drop as a warning diagnostic, never silently", () => {
		const state = doc({ "n-root": { props: { badgeText: "gone" } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		const diagnostics = droppedOverrideDiagnostics(result.dropped);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.severity).toBe("warning");
		expect(diagnostics[0]?.details?.kind).toBe("incompatibleOverride");
		expect(diagnostics[0]?.message).toContain("badgeText");
	});

	it("an override does not vouch for its own compatibility", () => {
		// Compatibility is judged against the definition WITHOUT the
		// instance's overrides; otherwise every override would look
		// compatible because it put the key there itself.
		const state = doc({ "n-root": { props: { invented: "x" } } });
		const result = switchInstanceVariant(state, ["i1"], { badge: "on" });
		expect(result.dropped[0]?.propertyKey).toBe("invented");
	});

	it("leaves overrides alone when the definition is unresolvable", () => {
		const state: AuthoringStateV1 = {
			...doc({ "n-root": { props: { badgeText: "x" } } }),
			componentDefinitions: {},
		};
		const result = switchInstanceVariant(state, ["i1"], { badge: "off" });
		// Retention beats pruning: an outage must not destroy data.
		expect(overridesOf(result.state)["n-root"]).toEqual({
			props: { badgeText: "x" },
		});
		expect(result.dropped).toEqual([]);
	});
});

describe("command validation (CORE-P2-009C)", () => {
	it("rejects an undeclared axis", () => {
		const state = doc();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.variant.set",
				instanceNodeIds: ["i1"],
				selection: { ghost: "on" },
			}).map((error) => error.details?.kind),
		).toContain("variantAxis");
	});

	it("rejects an undeclared option", () => {
		const state = doc();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.variant.set",
				instanceNodeIds: ["i1"],
				selection: { badge: "sideways" },
			}).map((error) => error.details?.kind),
		).toContain("variantAxisOption");
	});

	it("rejects a node that is not an instance", () => {
		const state = doc();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.variant.set",
				instanceNodeIds: ["nope"],
				selection: { badge: "off" },
			}).map((error) => error.details?.kind),
		).toContain("componentInstance");
	});

	it("rejects an empty target list", () => {
		const state = doc();
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "component.instance.variant.set",
				instanceNodeIds: [],
				selection: { badge: "off" },
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});
});
