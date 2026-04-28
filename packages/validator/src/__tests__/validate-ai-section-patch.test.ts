import type {
	AiComponentSchema,
	AiSectionContext,
	AiSectionPatch,
} from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiSectionPatch } from "../section.js";

// ---------------------------------------------------------------------------
// 11-component fixture suite — one component per AiFieldType cross-section,
// matching the demo-app's published surface area.
// ---------------------------------------------------------------------------

const componentFixtures: AiComponentSchema[] = [
	{
		componentName: "Hero",
		description: "Hero",
		fields: [
			{ name: "title", type: "text", required: true },
			{ name: "subtitle", type: "text" },
		],
	},
	{
		componentName: "RichText",
		description: "Rich text block",
		fields: [{ name: "body", type: "richtext", required: true }],
	},
	{
		componentName: "Counter",
		description: "Counter",
		fields: [{ name: "count", type: "number", required: true }],
	},
	{
		componentName: "Toggle",
		description: "Toggle",
		fields: [{ name: "enabled", type: "boolean", required: true }],
	},
	{
		componentName: "Image",
		description: "Image",
		fields: [{ name: "src", type: "image", required: true }],
	},
	{
		componentName: "Link",
		description: "Link",
		fields: [
			{ name: "href", type: "url", required: true },
			{ name: "label", type: "text", required: true },
		],
	},
	{
		componentName: "Swatch",
		description: "Color swatch",
		fields: [{ name: "color", type: "color", required: true }],
	},
	{
		componentName: "Variant",
		description: "Variant picker",
		fields: [
			{
				name: "variant",
				type: "select",
				required: true,
				options: [
					{ label: "Primary", value: "primary" },
					{ label: "Secondary", value: "secondary" },
				],
			},
		],
	},
	{
		componentName: "List",
		description: "List",
		fields: [
			{
				name: "items",
				type: "array",
				required: true,
				itemSchema: { name: "label", type: "text" },
			},
		],
	},
	{
		componentName: "Card",
		description: "Card",
		fields: [
			{
				name: "meta",
				type: "object",
				required: true,
			},
		],
	},
	{
		componentName: "Pricing",
		description: "Pricing",
		fields: [
			{ name: "title", type: "text", required: true },
			{ name: "monthly", type: "number" },
		],
	},
];

const happyPathPropsByName: Record<string, Record<string, unknown>> = {
	Hero: { title: "Welcome" },
	RichText: { body: "<p>Hello</p>" },
	Counter: { count: 7 },
	Toggle: { enabled: true },
	Image: { src: "/img/cover.png" },
	Link: { href: "https://anvilkit.dev", label: "Open" },
	Swatch: { color: "#FF8800" },
	Variant: { variant: "primary" },
	List: { items: ["alpha", "beta"] },
	Card: { meta: { kind: "card", index: 1 } },
	Pricing: { title: "Pro" },
};

function buildContext(
	overrides: Partial<AiSectionContext> = {},
): AiSectionContext {
	return {
		zoneId: "root-zone",
		nodeIds: ["selected-node-1"],
		availableComponents: componentFixtures,
		allowResize: false,
		...overrides,
	};
}

function buildPatch(overrides: Partial<AiSectionPatch> = {}): AiSectionPatch {
	return {
		zoneId: "root-zone",
		nodeIds: ["selected-node-1"],
		replacement: [
			{ id: "new-node-1", type: "Hero", props: { title: "Welcome" } },
		],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Happy paths.
// ---------------------------------------------------------------------------

describe("validateAiSectionPatch — happy paths", () => {
	it("accepts a single-component patch matching the context", () => {
		const ctx = buildContext();
		const patch = buildPatch();
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it.each(componentFixtures.map((c) => [c.componentName] as const))(
		"accepts a single-%s replacement",
		(name) => {
			const ctx = buildContext();
			const patch = buildPatch({
				replacement: [
					{
						id: `new-${name}`,
						type: name,
						props: happyPathPropsByName[name]!,
					},
				],
			});
			const result = validateAiSectionPatch(patch, ctx);
			expect(result.valid).toBe(true);
			expect(result.issues).toHaveLength(0);
		},
	);

	it("accepts a multi-node replacement matching nodeIds order + length", () => {
		const ctx = buildContext({ nodeIds: ["n1", "n2", "n3"] });
		const patch = buildPatch({
			nodeIds: ["n1", "n2", "n3"],
			replacement: [
				{ id: "a", type: "Hero", props: { title: "A" } },
				{ id: "b", type: "Counter", props: { count: 1 } },
				{ id: "c", type: "Toggle", props: { enabled: false } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts a size-changing patch when ctx.allowResize is true", () => {
		const ctx = buildContext({
			nodeIds: ["only-one"],
			allowResize: true,
		});
		const patch = buildPatch({
			nodeIds: ["only-one"],
			replacement: [
				{ id: "split-1", type: "Hero", props: { title: "Half 1" } },
				{ id: "split-2", type: "Hero", props: { title: "Half 2" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(true);
	});

	it("accepts replacements with nested children", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "outer",
					type: "Card",
					props: { meta: { kind: "card" } },
					children: [{ id: "inner", type: "Hero", props: { title: "Hi" } }],
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(true);
	});

	it("emits a warning (not error) for an extra prop key", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "n1",
					type: "Hero",
					props: { title: "Hi", extra: "noise" },
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(true);
		expect(result.issues.some((i) => i.level === "warning")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Flipped-pin tests — every documented code, asserted on a minimal
// failing input.
// ---------------------------------------------------------------------------

describe("validateAiSectionPatch — PATCH_SHAPE", () => {
	it("rejects a non-object patch", () => {
		const ctx = buildContext();
		const result = validateAiSectionPatch("not-an-object", ctx);
		expect(result.valid).toBe(false);
		expect(result.issues[0]?.code).toBe("PATCH_SHAPE");
	});

	it("rejects a zoneId mismatch", () => {
		const ctx = buildContext();
		const patch = buildPatch({ zoneId: "different-zone" });
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});

	it("rejects a nodeIds length mismatch", () => {
		const ctx = buildContext({ nodeIds: ["a", "b"] });
		const patch = buildPatch({
			nodeIds: ["a"],
			replacement: [{ id: "n", type: "Hero", props: { title: "Hi" } }],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});

	it("rejects a nodeIds order mismatch", () => {
		const ctx = buildContext({ nodeIds: ["a", "b"] });
		const patch = buildPatch({
			nodeIds: ["b", "a"],
			replacement: [
				{ id: "x", type: "Hero", props: { title: "X" } },
				{ id: "y", type: "Hero", props: { title: "Y" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});

	it("rejects replacement.length ≠ nodeIds.length when allowResize=false", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{ id: "a", type: "Hero", props: { title: "A" } },
				{ id: "b", type: "Hero", props: { title: "B" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});

	it("rejects a non-array replacement", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: ["selected-node-1"],
			replacement: "should-be-array",
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});

	it("rejects a non-array nodeIds", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: "not-an-array",
			replacement: [{ id: "x", type: "Hero", props: { title: "X" } }],
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "PATCH_SHAPE")).toBe(true);
	});
});

describe("validateAiSectionPatch — INVALID_NODE", () => {
	it("rejects a replacement entry that is not an object", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: ["selected-node-1"],
			replacement: [42],
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node missing a string id", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{ id: 42 as unknown as string, type: "Hero", props: { title: "X" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node missing a string type", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: ["selected-node-1"],
			replacement: [{ id: "x", props: {} }],
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node whose props is not an object", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: ["selected-node-1"],
			replacement: [{ id: "x", type: "Hero", props: "string" }],
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node whose slot is not a string", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "X" },
					slot: 42 as unknown as string,
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node whose slotKind is neither 'slot' nor 'zone'", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "X" },
					slotKind: "invalid" as unknown as "slot",
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a node whose children is not an array", () => {
		const ctx = buildContext();
		const patch = {
			zoneId: "root-zone",
			nodeIds: ["selected-node-1"],
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "X" },
					children: "not-an-array",
				},
			],
		};
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a missing required prop", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [{ id: "x", type: "Hero", props: {} }],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a wrong field type", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{ id: "x", type: "Counter", props: { count: "seven" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects an invalid enum value", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{ id: "x", type: "Variant", props: { variant: "tertiary" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});

	it("rejects a tree exceeding MAX_NODE_DEPTH", () => {
		const ctx = buildContext();
		// Build a 20-level deep tree (depth budget is 16)
		type N = {
			id: string;
			type: string;
			props: Record<string, unknown>;
			children?: N[];
		};
		let leaf: N = { id: "leaf", type: "Hero", props: { title: "leaf" } };
		for (let i = 0; i < 20; i++) {
			leaf = {
				id: `n${i}`,
				type: "Hero",
				props: { title: `n${i}` },
				children: [leaf],
			};
		}
		const patch = buildPatch({ replacement: [leaf] });
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "INVALID_NODE")).toBe(true);
	});
});

describe("validateAiSectionPatch — NON_SERIALIZABLE_PROP", () => {
	it("rejects a function in props", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "Hi", onClick: () => undefined },
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "NON_SERIALIZABLE_PROP")).toBe(
			true,
		);
	});

	it("rejects a symbol in props", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "Hi", token: Symbol("nope") },
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "NON_SERIALIZABLE_PROP")).toBe(
			true,
		);
	});

	it("rejects a bigint in props", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{
					id: "x",
					type: "Hero",
					props: { title: "Hi", big: BigInt(42) },
				},
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "NON_SERIALIZABLE_PROP")).toBe(
			true,
		);
	});

	it("rejects a circular reference in props", () => {
		const ctx = buildContext();
		const cyclic: Record<string, unknown> = { title: "Hi" };
		cyclic.self = cyclic;
		const patch = buildPatch({
			replacement: [{ id: "x", type: "Hero", props: cyclic }],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(result.issues.some((i) => i.code === "NON_SERIALIZABLE_PROP")).toBe(
			true,
		);
	});
});

describe("validateAiSectionPatch — DISALLOWED_COMPONENT", () => {
	it("rejects a component not in availableComponents", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [
				{ id: "x", type: "NotRegistered", props: { title: "Hi" } },
			],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) => i.code === "DISALLOWED_COMPONENT");
		expect(issue).toBeDefined();
		expect(issue?.componentName).toBe("NotRegistered");
	});

	it("includes a closest-match suggestion when one exists", () => {
		const ctx = buildContext();
		const patch = buildPatch({
			replacement: [{ id: "x", type: "Heroo", props: { title: "Hi" } }],
		});
		const result = validateAiSectionPatch(patch, ctx);
		const issue = result.issues.find((i) => i.code === "DISALLOWED_COMPONENT");
		expect(issue?.message).toContain("Hero");
	});

	it("rejects components allow-listed elsewhere but absent from this zone's set", () => {
		const ctx = buildContext({
			availableComponents: componentFixtures.filter(
				(c) => c.componentName === "Hero",
			),
		});
		const patch = buildPatch({
			replacement: [{ id: "x", type: "Counter", props: { count: 1 } }],
		});
		const result = validateAiSectionPatch(patch, ctx);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some((i) => i.code === "DISALLOWED_COMPONENT"),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 200-fixture hostile-patch suite — a deterministic seeded RNG generates
// 200 mutated patches, each derived from a known-valid base by applying
// 1–3 mutations from a documented list. Every mutation makes the patch
// invalid; the suite asserts every generated patch is rejected.
// ---------------------------------------------------------------------------

function createRng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0xffffffff;
		return (s >>> 0) / 0xffffffff;
	};
}

type MutablePatch = {
	zoneId: unknown;
	nodeIds: unknown;
	replacement: unknown;
};

type Mutator = (patch: MutablePatch, rng: () => number) => void;

const hostileMutators: readonly Mutator[] = [
	(p) => {
		p.zoneId = "OTHER-ZONE";
	},
	(p) => {
		p.zoneId = 12345;
	},
	(p) => {
		p.nodeIds = "not-an-array";
	},
	(p) => {
		p.nodeIds = [];
	},
	(p) => {
		if (Array.isArray(p.nodeIds)) p.nodeIds = [...p.nodeIds, "extra"];
	},
	(p) => {
		if (Array.isArray(p.nodeIds) && p.nodeIds.length > 0) {
			// Replace the first id with a known-mismatching one so the
			// mutation is guaranteed hostile even on length-1 node lists
			// (a literal `.reverse()` would be a silent no-op there).
			p.nodeIds = ["scrambled-id", ...p.nodeIds.slice(1)];
		}
	},
	(p) => {
		p.replacement = "not-an-array";
	},
	(p) => {
		p.replacement = null;
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).id = 42;
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).type = "NotRegistered";
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).type = undefined;
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).props = "not-an-object";
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).props = {};
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			const node = r[0] as Record<string, unknown>;
			const props = (node.props ?? {}) as Record<string, unknown>;
			node.props = { ...props, leaked: () => undefined };
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			const node = r[0] as Record<string, unknown>;
			const props = (node.props ?? {}) as Record<string, unknown>;
			node.props = { ...props, big: BigInt(1) };
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).children = "not-an-array";
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).slot = 42;
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).slotKind = "weird";
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r)) p.replacement = [...r, ...r];
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			(r[0] as Record<string, unknown>).children = [42];
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			const node = r[0] as Record<string, unknown>;
			const props = (node.props ?? {}) as Record<string, unknown>;
			delete props.title;
		}
	},
	(p) => {
		const r = p.replacement;
		if (Array.isArray(r) && r[0] && typeof r[0] === "object") {
			const node = r[0] as Record<string, unknown>;
			node.type = "Counter";
			node.props = { count: "seven" };
		}
	},
];

function buildBaseValidPatch(): MutablePatch {
	return {
		zoneId: "root-zone",
		nodeIds: ["selected-node-1"],
		replacement: [
			{ id: "new-node-1", type: "Hero", props: { title: "Welcome" } },
		],
	};
}

const allowedSectionCodes = new Set([
	"PATCH_SHAPE",
	"INVALID_NODE",
	"NON_SERIALIZABLE_PROP",
	"DISALLOWED_COMPONENT",
]);

describe("validateAiSectionPatch — 200-fixture hostile suite", () => {
	const SEED = 42;
	const PERMUTATIONS = 200;

	it(`rejects ${PERMUTATIONS} mutated patches and uses only the four documented codes`, () => {
		const ctx = buildContext();
		const rng = createRng(SEED);
		const baseJson = JSON.stringify(buildBaseValidPatch());

		let rejected = 0;
		for (let i = 0; i < PERMUTATIONS; i++) {
			const patch = buildBaseValidPatch();
			const numMutations = 1 + Math.floor(rng() * 3);

			for (let m = 0; m < numMutations; m++) {
				const idx = Math.floor(rng() * hostileMutators.length);
				hostileMutators[idx]!(patch, rng);
			}

			// Safety net: if the random composition coincidentally
			// produced a no-op (rare, but possible under adversarial
			// mutator combinations), force a guaranteed-hostile change so
			// the suite never silently degrades into an accept-all. A
			// patch that throws on JSON.stringify is hostile by definition
			// (bigint / function / circular content) so skip the check.
			let stringified: string | undefined;
			try {
				stringified = JSON.stringify(patch);
			} catch {
				stringified = undefined;
			}
			if (stringified !== undefined && stringified === baseJson) {
				patch.zoneId = `forced-mismatch-${i}`;
			}

			const result = validateAiSectionPatch(patch, ctx);

			if (!result.valid) rejected += 1;

			for (const issue of result.issues) {
				expect(allowedSectionCodes.has(issue.code)).toBe(true);
				expect(typeof issue.message).toBe("string");
				expect(issue.message.length).toBeGreaterThan(0);
				expect(["error", "warning"]).toContain(issue.level);
				expect(Array.isArray(issue.path)).toBe(true);
			}
		}

		expect(rejected).toBe(PERMUTATIONS);
	});
});
