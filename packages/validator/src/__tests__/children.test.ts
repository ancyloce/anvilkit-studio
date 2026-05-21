/**
 * Regression tests for phase4-014 F-2 (`[INVALID_CHILDREN]`).
 *
 * The AI pipeline used to accept non-array `children` values
 * silently, causing a downstream `.map is not a function` crash in
 * `irToPuckPatch`. `validateAiOutput` now rejects them with a
 * `[INVALID_CHILDREN]` error. These tests lock that behavior in and
 * cover the nested-recursion path — children of children must be
 * walked, so a non-array nested `children` is flagged just like a
 * top-level one.
 *
 * See `docs/tasks/phase5-019-phase4-carryovers.md` § F-2.
 */

import type { AiComponentSchema } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiOutput } from "../validate-ai-output.js";

const sectionSchema: AiComponentSchema = {
	componentName: "Section",
	description: "A page section",
	fields: [{ name: "heading", type: "text" }],
};

const schemas = [sectionSchema];

describe("validateAiOutput — INVALID_CHILDREN (phase4-014 F-2)", () => {
	it("rejects a top-level `children` that is not an array", () => {
		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: "not-an-array" as unknown as unknown[],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_CHILDREN]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toBe("root.children");
		expect(issue!.message).toContain("got string");
	});

	it("rejects `null` children — caller likely meant an empty array", () => {
		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: null as unknown as unknown[],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_CHILDREN]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("got null");
	});

	it("rejects a nested non-array `children` — recursion is mandatory", () => {
		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "s1",
						type: "Section",
						props: { id: "s1", heading: "Outer" },
						children: { not: "an array" } as unknown as unknown[],
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(false);
		const issue = result.issues.find((i) =>
			i.message.includes("[INVALID_CHILDREN]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toBe("root.children.0.children");
	});

	it("accepts an empty children array on every node", () => {
		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{
						id: "s1",
						type: "Section",
						props: { id: "s1", heading: "Leaf" },
						children: [],
					},
				],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(true);
	});

	it("accepts `undefined` children — it's the canonical leaf shape", () => {
		const ir = {
			version: "1" as const,
			root: {
				id: "root",
				type: "__root__",
				props: {},
				children: [
					{ id: "s1", type: "Section", props: { id: "s1", heading: "Leaf" } },
				],
			},
			assets: [],
			metadata: {},
		};
		const result = validateAiOutput(ir, schemas);
		expect(result.valid).toBe(true);
	});
});
