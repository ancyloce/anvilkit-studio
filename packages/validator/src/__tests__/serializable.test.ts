/**
 * Regression tests for phase4-014 F-3 (`[NON_SERIALIZABLE_PROP]`).
 *
 * `validateAiOutput` upstream Zod schemas use `unknown()` for
 * free-form prop values, which silently accepted functions, symbols,
 * and bigints — values that later broke `structuredClone` and
 * `localStorage` rehydration in the editor. The validator now walks
 * every prop value recursively and flags any non-JSON-serializable
 * leaf.
 *
 * See `docs/tasks/phase5-019-phase4-carryovers.md` § F-3.
 */

import type { AiComponentSchema } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { validateAiOutput } from "../validate-ai-output.js";

const heroSchema: AiComponentSchema = {
	componentName: "Hero",
	description: "A hero banner",
	fields: [
		{ name: "title", type: "text", required: true },
		{ name: "meta", type: "text" },
	],
};

const schemas = [heroSchema];

function wrap(props: Record<string, unknown>) {
	return {
		version: "1" as const,
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [{ id: "h1", type: "Hero", props: { id: "h1", ...props } }],
		},
		assets: [],
		metadata: {},
	};
}

describe("validateAiOutput — NON_SERIALIZABLE_PROP (phase4-014 F-3)", () => {
	it("rejects a top-level function-valued prop", () => {
		const ir = wrap({ title: "Hello", meta: () => "oops" });
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("function");
	});

	it("rejects a nested function inside an object prop", () => {
		const ir = wrap({
			title: "Hello",
			meta: { deep: { callback: () => "oops" } },
		});
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("deep");
		expect(issue!.path).toContain("callback");
	});

	it("rejects a function inside an array prop", () => {
		const ir = wrap({
			title: "Hello",
			meta: [1, 2, () => "oops"],
		});
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.path).toContain("meta.2");
	});

	it("rejects symbol-valued props", () => {
		const ir = wrap({ title: "Hello", meta: Symbol("bad") });
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("symbol");
	});

	it("rejects bigint-valued props", () => {
		const ir = wrap({ title: "Hello", meta: BigInt(42) });
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("bigint");
	});

	it("rejects cyclic object graphs", () => {
		const meta: Record<string, unknown> = { a: 1 };
		meta.self = meta;
		const ir = wrap({ title: "Hello", meta });
		const result = validateAiOutput(ir, schemas);
		const issue = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(issue).toBeDefined();
		expect(issue!.message).toContain("circular");
	});

	it("accepts deeply-nested pure JSON values", () => {
		const ir = wrap({
			title: "Hello",
			meta: {
				nested: {
					list: [1, "two", true, null, { deeper: { ok: true } }],
				},
			},
		});
		const result = validateAiOutput(ir, schemas);
		const nonSer = result.issues.find((i) =>
			i.message.includes("[NON_SERIALIZABLE_PROP]"),
		);
		expect(nonSer).toBeUndefined();
	});
});
