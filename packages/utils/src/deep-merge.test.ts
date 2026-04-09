import { describe, expect, it } from "vitest";
import { deepMerge } from "./deep-merge.js";

describe("deepMerge", () => {
	it("returns a new object and does not mutate the target", () => {
		const target = { a: 1, nested: { b: 2 } };
		const result = deepMerge(target, { nested: { b: 3 } });
		expect(result).toEqual({ a: 1, nested: { b: 3 } });
		expect(target).toEqual({ a: 1, nested: { b: 2 } });
		expect(result).not.toBe(target);
		expect(result.nested).not.toBe(target.nested);
	});

	it("overrides primitives with the last source's value (total order)", () => {
		const result = deepMerge(
			{ mode: "light" as "light" | "dark" | "auto" },
			{ mode: "dark" },
			{ mode: "auto" },
		);
		expect(result).toEqual({ mode: "auto" });
	});

	it("merges nested plain objects recursively", () => {
		const result = deepMerge(
			{ theme: { mode: "light", tokens: { primary: "#000", bg: "#fff" } } },
			{ theme: { mode: "dark", tokens: { primary: "#111" } } },
		);
		expect(result).toEqual({
			theme: { mode: "dark", tokens: { primary: "#111", bg: "#fff" } },
		});
	});

	it("replaces arrays instead of concatenating them", () => {
		const result = deepMerge(
			{ tags: ["a", "b", "c"] },
			{ tags: ["x", "y"] },
		);
		expect(result.tags).toEqual(["x", "y"]);
	});

	it("treats class instances as leaf values and assigns by reference", () => {
		class Custom {
			constructor(public readonly label: string) {}
		}
		const instance = new Custom("ref");
		const result = deepMerge({ item: new Custom("old") }, { item: instance });
		expect(result.item).toBe(instance);
	});

	it("treats Date as a leaf value", () => {
		const date = new Date("2026-04-09");
		const result = deepMerge({ when: new Date(0) }, { when: date });
		expect(result.when).toBe(date);
	});

	it("skips undefined sources so callers can pass optional layers", () => {
		const result = deepMerge(
			{ a: 1, b: 2 },
			undefined,
			{ b: 3 },
			undefined,
		);
		expect(result).toEqual({ a: 1, b: 3 });
	});

	it("copies source keys when the target is not a plain object", () => {
		// e.g. merging into null/primitives falls through to a fresh object
		const result = deepMerge(null as unknown as { a: number }, { a: 1 });
		expect(result).toEqual({ a: 1 });
	});

	it("returns the source directly when it is not a plain object", () => {
		const result = deepMerge({ a: 1 }, 42 as unknown as { a: number });
		expect(result).toBe(42);
	});

	it("creates a fresh object when merging source into a non-object target value at a key", () => {
		const result = deepMerge(
			{ value: 1 as number | { nested: string } },
			{ value: { nested: "ok" } },
		);
		expect(result).toEqual({ value: { nested: "ok" } });
	});

	it("rejects prototype-pollution keys from sources", () => {
		const malicious = JSON.parse('{"__proto__":{"polluted":true}}');
		const result = deepMerge({ safe: true }, malicious);
		expect(result).toEqual({ safe: true });
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it("rejects `constructor` and `prototype` forbidden keys", () => {
		const result = deepMerge(
			{ ok: 1 },
			{ constructor: "bad", prototype: "bad" } as unknown as {
				ok?: number;
			},
		);
		expect(result).toEqual({ ok: 1 });
		expect((result as Record<string, unknown>).constructor).toBe(
			Object.prototype.constructor,
		);
	});

	it("treats null-prototype records as plain objects", () => {
		const record = Object.create(null) as Record<string, unknown>;
		record.key = "value";
		const result = deepMerge({ existing: true }, record);
		expect(result).toEqual({ existing: true, key: "value" });
	});

	it("supports an empty sources list", () => {
		const target = { a: 1, nested: { b: 2 } };
		const result = deepMerge(target);
		expect(result).toEqual(target);
		expect(result).not.toBe(target);
	});
});
