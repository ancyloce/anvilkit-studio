/**
 * Reusable style definitions (PLAN-0020 CORE-P2-003;
 * ED-STYLEDEF-001/002; DD-0019 §11.3, §15.1): ordered multi-attach,
 * propagation without per-node copies, §11.3 precedence with
 * definitions present, appearance-equivalent deletion, and stable
 * exporter CSS variable names.
 */

import type {
	StyleDefinition,
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
	resolveNodeAuthoring,
	stableIdHash,
	styleDefinitionCssVariableName,
	tokenCssVariableName,
	validateAtomicCommand,
} from "../index.js";

let commandCounter = 0;
function base(expectedRevision: number): EditorCommandBase {
	commandCounter += 1;
	return {
		id: `sd-${commandCounter}`,
		expectedRevision,
		source: "inspector",
		timestamp: 1_750_000_000_000,
	};
}

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

function definition(
	id: string,
	layout: Record<string, unknown>,
	overrides?: Record<string, Record<string, unknown>>,
): StyleDefinition {
	return {
		version: "1",
		id,
		name: id,
		appliesTo: "any",
		layout: { base: layout, ...(overrides ? { overrides } : {}) },
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	} as StyleDefinition;
}

const BP = {
	id: "tablet",
	label: "Tablet",
	maxWidth: 991,
	order: 0,
	enabled: true,
} as const;

function docWith(
	definitions: readonly StyleDefinition[],
	nodes: AuthoringStateV1["nodes"] = {},
): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		breakpoints: [BP],
		styleDefinitions: Object.fromEntries(
			definitions.map((entry) => [entry.id, entry]),
		),
		nodes,
	};
}

const resolveAt = (state: AuthoringStateV1, nodeId: string, width = 1400) =>
	resolveNodeAuthoring(nodeId, {
		authoring: state,
		breakpoints: state.breakpoints,
		viewportWidth: width,
		tokenMode: "light",
	});

describe("create / attach (ED-STYLEDEF-001)", () => {
	it("creates a definition and rejects duplicates", () => {
		const state = docWith([]);
		const created = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.create",
			definition: definition("card", { gap: px(8) }),
		});
		expect(created.status).toBe("changed");
		expect(created.state.styleDefinitions.card).toBeDefined();

		expect(
			validateAtomicCommand(created.state, {
				...base(created.state.revision),
				type: "styleDefinition.create",
				definition: definition("card", { gap: px(4) }),
			}).map((error) => error.details?.reason),
		).toContain("duplicate-id");
	});

	it("attaches in list order and appends by default", () => {
		let state = docWith([
			definition("a", { gap: px(2) }),
			definition("b", { gap: px(4) }),
		]);
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.attach",
			nodeIds: ["n1"],
			styleDefinitionId: "a",
			layer: "base",
		}).state;
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.attach",
			nodeIds: ["n1"],
			styleDefinitionId: "b",
			layer: "base",
		}).state;
		expect(state.nodes.n1?.styleRefs?.base).toEqual(["a", "b"]);
	});

	it("honours an explicit insertion position", () => {
		let state = docWith([
			definition("a", { gap: px(2) }),
			definition("b", { gap: px(4) }),
		]);
		for (const id of ["a", "b"]) {
			state = applyEditorCommand(state, {
				...base(state.revision),
				type: "styleDefinition.attach",
				nodeIds: ["n1"],
				styleDefinitionId: id,
				layer: "base",
			}).state;
		}
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.create",
			definition: definition("c", { gap: px(6) }),
		}).state;
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.attach",
			nodeIds: ["n1"],
			styleDefinitionId: "c",
			layer: "base",
			position: 0,
		}).state;
		expect(state.nodes.n1?.styleRefs?.base).toEqual(["c", "a", "b"]);
	});

	it("re-attaching an already-referenced definition is a noop", () => {
		let state = docWith([definition("a", { gap: px(2) })]);
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.attach",
			nodeIds: ["n1"],
			styleDefinitionId: "a",
			layer: "base",
		}).state;
		const again = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.attach",
			nodeIds: ["n1"],
			styleDefinitionId: "a",
			layer: "base",
		});
		expect(again.status).toBe("noop");
	});

	it("rejects attaching an unknown definition", () => {
		const state = docWith([]);
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "styleDefinition.attach",
				nodeIds: ["n1"],
				styleDefinitionId: "ghost",
				layer: "base",
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});
});

describe("precedence with definitions present (§11.3)", () => {
	it("later definitions win over earlier ones, node values win over all", () => {
		const state = docWith(
			[
				definition("a", { gap: px(2), width: px(100) }),
				definition("b", { gap: px(4) }),
			],
			{
				n1: {
					version: "1",
					styleRefs: { base: ["a", "b"] },
					layout: { base: { width: px(300) } },
				},
			},
		);
		const resolved = resolveAt(state, "n1");
		// b overrides a's gap; a's width survives (property-wise);
		// the node's own width beats both.
		expect(resolved.layout.gap).toEqual(px(4));
		expect(resolved.layout.width).toEqual(px(300));
	});

	it("propagates a definition update to every referencing node", () => {
		let state = docWith([definition("a", { gap: px(2) })], {
			n1: { version: "1", styleRefs: { base: ["a"] } },
			n2: { version: "1", styleRefs: { base: ["a"] } },
		});
		expect(resolveAt(state, "n1").layout.gap).toEqual(px(2));

		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.update",
			styleDefinitionId: "a",
			patch: { layout: { base: { gap: px(12) } } },
		}).state;

		// No per-node copies exist, so both nodes move together.
		expect(resolveAt(state, "n1").layout.gap).toEqual(px(12));
		expect(resolveAt(state, "n2").layout.gap).toEqual(px(12));
		expect(state.nodes.n1?.layout).toBeUndefined();
	});

	it("rejects updating an unknown definition", () => {
		const state = docWith([]);
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "styleDefinition.update",
				styleDefinitionId: "ghost",
				patch: { name: "x" },
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});
});

describe("detach", () => {
	it("removes one ref and leaves the rest in order", () => {
		let state = docWith(
			[
				definition("a", { gap: px(2) }),
				definition("b", { gap: px(4) }),
				definition("c", { gap: px(6) }),
			],
			{ n1: { version: "1", styleRefs: { base: ["a", "b", "c"] } } },
		);
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.detach",
			nodeIds: ["n1"],
			styleDefinitionId: "b",
			layer: "base",
		}).state;
		expect(state.nodes.n1?.styleRefs?.base).toEqual(["a", "c"]);
	});

	it("drops the record entirely when the last ref goes", () => {
		let state = docWith([definition("a", { gap: px(2) })], {
			n1: { version: "1", styleRefs: { base: ["a"] } },
		});
		state = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.detach",
			nodeIds: ["n1"],
			styleDefinitionId: "a",
			layer: "base",
		}).state;
		expect(state.nodes.n1).toBeUndefined();
	});
});

describe("deletion materializes resolved values (§15.1)", () => {
	it("preserves appearance when the deleted definition is last", () => {
		const state = docWith(
			[
				definition("a", { gap: px(2), width: px(100) }),
				definition("b", { gap: px(4) }),
			],
			{ n1: { version: "1", styleRefs: { base: ["a", "b"] } } },
		);
		const before = resolveAt(state, "n1").layout;
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.delete",
			styleDefinitionId: "b",
			disposition: { kind: "materialize" },
		}).state;
		expect(next.styleDefinitions.b).toBeUndefined();
		expect(resolveAt(next, "n1").layout).toEqual(before);
	});

	it("preserves appearance when the deleted definition is overridden by a later one", () => {
		// The ordering trap: `a` is shadowed by `b` on `gap`. Copying
		// `a` wholesale into the node would promote gap:2 above b's
		// gap:4 and visibly change the render.
		const state = docWith(
			[
				definition("a", { gap: px(2), width: px(100) }),
				definition("b", { gap: px(4) }),
			],
			{ n1: { version: "1", styleRefs: { base: ["a", "b"] } } },
		);
		const before = resolveAt(state, "n1").layout;
		expect(before.gap).toEqual(px(4));

		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.delete",
			styleDefinitionId: "a",
			disposition: { kind: "materialize" },
		}).state;
		expect(resolveAt(next, "n1").layout).toEqual(before);
		expect(resolveAt(next, "n1").layout.gap).toEqual(px(4));
		expect(resolveAt(next, "n1").layout.width).toEqual(px(100));
	});

	it("keeps the node's own value winning over the materialized one", () => {
		const state = docWith([definition("a", { gap: px(2) })], {
			n1: {
				version: "1",
				styleRefs: { base: ["a"] },
				layout: { base: { gap: px(9) } },
			},
		});
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.delete",
			styleDefinitionId: "a",
			disposition: { kind: "materialize" },
		}).state;
		expect(next.nodes.n1?.layout?.base?.gap).toEqual(px(9));
	});

	it("materializes per breakpoint layer", () => {
		const state = docWith(
			[definition("a", { gap: px(2) }, { tablet: { gap: px(1) } })],
			{
				n1: {
					version: "1",
					styleRefs: { base: ["a"], overrides: { tablet: ["a"] } },
				},
			},
		);
		const beforeWide = resolveAt(state, "n1", 1400).layout;
		const beforeNarrow = resolveAt(state, "n1", 800).layout;
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.delete",
			styleDefinitionId: "a",
			disposition: { kind: "materialize" },
		}).state;
		expect(resolveAt(next, "n1", 1400).layout).toEqual(beforeWide);
		expect(resolveAt(next, "n1", 800).layout).toEqual(beforeNarrow);
	});

	it("discards the contribution when asked to", () => {
		const state = docWith([definition("a", { gap: px(2) })], {
			n1: { version: "1", styleRefs: { base: ["a"] } },
		});
		const next = applyEditorCommand(state, {
			...base(state.revision),
			type: "styleDefinition.delete",
			styleDefinitionId: "a",
			disposition: { kind: "discard" },
		}).state;
		expect(next.styleDefinitions.a).toBeUndefined();
		expect(resolveAt(next, "n1").layout.gap).toBeUndefined();
	});

	it("rejects deleting an unknown definition", () => {
		const state = docWith([]);
		expect(
			validateAtomicCommand(state, {
				...base(state.revision),
				type: "styleDefinition.delete",
				styleDefinitionId: "ghost",
				disposition: { kind: "materialize" },
			}).map((error) => error.code),
		).toContain("EDITOR_NODE_NOT_FOUND");
	});
});

describe("stable exporter CSS variable names (§15.1)", () => {
	it("keeps the id-derived suffix stable across a rename", () => {
		const before = definition("sd-1", {});
		const renamed: StyleDefinition = { ...before, name: "Totally Renamed" };
		const a = styleDefinitionCssVariableName({ ...before, name: "Card" });
		const b = styleDefinitionCssVariableName(renamed);
		expect(a).not.toBe(b);
		// The readable slug changes; the stable component does not.
		const suffix = stableIdHash("sd-1");
		expect(a.endsWith(suffix)).toBe(true);
		expect(b.endsWith(suffix)).toBe(true);
	});

	it("distinguishes tokens whose paths slugify identically", () => {
		const one = tokenCssVariableName({
			id: "id-one",
			path: ["color", "Brand 500"],
			name: "Brand",
			type: "color",
			values: {},
		});
		const two = tokenCssVariableName({
			id: "id-two",
			path: ["color", "brand-500"],
			name: "Brand",
			type: "color",
			values: {},
		});
		expect(one).not.toBe(two);
		expect(one.startsWith("--ak-tok-color-brand-500-")).toBe(true);
	});

	it("emits ident-safe names and is deterministic", () => {
		const name = tokenCssVariableName({
			id: "x",
			path: ["Spacing", "2XL!!"],
			name: "n",
			type: "length",
			values: {},
		});
		expect(name).toMatch(/^--ak-tok-[a-z0-9-]+$/);
		expect(stableIdHash("x")).toBe(stableIdHash("x"));
	});
});
