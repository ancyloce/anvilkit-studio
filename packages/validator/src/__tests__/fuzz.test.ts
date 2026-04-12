import type { AiComponentSchema } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiOutput } from "../validate-ai-output.js";

const components: AiComponentSchema[] = [
	{
		componentName: "Hero",
		description: "Hero",
		fields: [
			{ name: "title", type: "text", required: true },
			{ name: "count", type: "number" },
		],
	},
	{
		componentName: "Section",
		description: "Section",
		fields: [{ name: "heading", type: "text" }],
	},
];

function createRng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) & 0xffffffff;
		return (s >>> 0) / 0xffffffff;
	};
}

function makeBaseIR() {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "h1",
					type: "Hero",
					props: { id: "h1", title: "Hello" },
				},
			],
		},
		assets: [],
		metadata: {},
	};
}

type Mutator = (ir: Record<string, unknown>, rng: () => number) => void;

const mutators: Mutator[] = [
	(ir) => {
		delete ir.version;
	},
	(ir) => {
		ir.version = "99";
	},
	(ir) => {
		ir.root = null;
	},
	(ir) => {
		ir.root = "not-a-node";
	},
	(ir) => {
		if (ir.root && typeof ir.root === "object")
			(ir.root as Record<string, unknown>).type = undefined;
	},
	(ir) => {
		const root = ir.root as {
			children: Array<Record<string, unknown>>;
		} | null;
		if (root?.children?.[0]) root.children[0].type = "NonExistent";
	},
	(ir) => {
		const root = ir.root as {
			children: Array<Record<string, unknown>>;
		} | null;
		const child = root?.children?.[0];
		if (child && typeof child.props === "object" && child.props) {
			(child.props as Record<string, unknown>).title = 999;
		}
	},
	(ir) => {
		const root = ir.root as {
			children: Array<Record<string, unknown>>;
		} | null;
		const child = root?.children?.[0];
		if (child && typeof child.props === "object" && child.props) {
			delete (child.props as Record<string, unknown>).title;
		}
	},
	(ir) => {
		const root = ir.root as {
			children: Array<Record<string, unknown>>;
		} | null;
		const child = root?.children?.[0];
		if (child && typeof child.props === "object" && child.props) {
			(child.props as Record<string, unknown>).hallucinated = "bad";
		}
	},
	(ir) => {
		ir.assets = [{ id: "a1", kind: "image" }];
	},
	(ir) => {
		ir.assets = [{ id: "a1", kind: "banana", url: "x" }];
	},
	(ir) => {
		if (ir.root && typeof ir.root === "object")
			(ir.root as Record<string, unknown>).children = "not-an-array";
	},
	(ir) => {
		const root = ir.root as {
			children: Array<Record<string, unknown>>;
		} | null;
		if (root?.children?.[0]) {
			root.children[0].children = [
				{ id: "deep", type: "DoesNotExist", props: {} },
			];
		}
	},
	(ir) => {
		ir.version = 1;
	},
	() => {
		/* no-op: empty mutation for coverage */
	},
];

describe("fuzz: validateAiOutput", () => {
	const SEED = 42;
	const PERMUTATIONS = 100;

	it(`rejects ${PERMUTATIONS} malformed IR permutations`, () => {
		const rng = createRng(SEED);

		for (let i = 0; i < PERMUTATIONS; i++) {
			const ir = makeBaseIR() as Record<string, unknown>;

			const numMutations = 1 + Math.floor(rng() * 3);
			for (let m = 0; m < numMutations; m++) {
				const mutatorIdx = Math.floor(rng() * mutators.length);
				mutators[mutatorIdx](ir, rng);
			}

			const result = validateAiOutput(ir, components);

			if (result.valid && result.issues.length === 0) {
				continue;
			}

			for (const issue of result.issues) {
				expect(typeof issue.path).toBe("string");
				expect(typeof issue.message).toBe("string");
				expect(issue.message.length).toBeGreaterThan(0);
				expect(["error", "warn"]).toContain(issue.severity);
			}
		}
	});
});
