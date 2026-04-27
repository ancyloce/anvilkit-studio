import { describe, expect, it } from "vitest";
import { isJsonSerializable } from "../is-json-serializable.js";

describe("isJsonSerializable", () => {
	// ----- Happy path: primitives -----
	it("returns true for strings", () => {
		expect(isJsonSerializable("hello")).toBe(true);
	});

	it("returns true for numbers", () => {
		expect(isJsonSerializable(42)).toBe(true);
		expect(isJsonSerializable(0)).toBe(true);
		expect(isJsonSerializable(-3.14)).toBe(true);
	});

	it("returns true for booleans", () => {
		expect(isJsonSerializable(true)).toBe(true);
		expect(isJsonSerializable(false)).toBe(true);
	});

	it("returns true for null", () => {
		expect(isJsonSerializable(null)).toBe(true);
	});

	// ----- Happy path: composites -----
	it("returns true for plain arrays", () => {
		expect(isJsonSerializable([1, "two", true, null])).toBe(true);
	});

	it("returns true for plain objects", () => {
		expect(isJsonSerializable({ a: 1, b: "two", c: true })).toBe(true);
	});

	it("returns true for nested structures", () => {
		expect(
			isJsonSerializable({ items: [{ name: "Alice", active: true }] }),
		).toBe(true);
	});

	it("returns true for empty arrays and objects", () => {
		expect(isJsonSerializable([])).toBe(true);
		expect(isJsonSerializable({})).toBe(true);
	});

	// ----- Sad path: non-serializable -----
	it("returns false for undefined", () => {
		expect(isJsonSerializable(undefined)).toBe(false);
	});

	it("returns false for functions", () => {
		expect(
			isJsonSerializable(() => {
				/* noop */
			}),
		).toBe(false);
		expect(
			isJsonSerializable(function named() {
				/* noop */
			}),
		).toBe(false);
	});

	it("returns false for symbols", () => {
		expect(isJsonSerializable(Symbol("test"))).toBe(false);
	});

	it("returns false for bigints", () => {
		expect(isJsonSerializable(BigInt(42))).toBe(false);
	});

	it("returns false for Date by default", () => {
		expect(isJsonSerializable(new Date())).toBe(false);
	});

	it("returns true for Date when dateAsIso is true", () => {
		expect(isJsonSerializable(new Date(), { dateAsIso: true })).toBe(true);
	});

	it("returns false for class instances", () => {
		class Custom {
			value = 1;
		}
		expect(isJsonSerializable(new Custom())).toBe(false);
	});

	it("returns false for Map instances", () => {
		expect(isJsonSerializable(new Map())).toBe(false);
	});

	it("returns false for Set instances", () => {
		expect(isJsonSerializable(new Set())).toBe(false);
	});

	it("returns false for RegExp instances", () => {
		expect(isJsonSerializable(/test/)).toBe(false);
	});

	// ----- Nested sad paths -----
	it("returns false when a nested value is not serializable", () => {
		expect(
			isJsonSerializable({
				fn: () => {
					/* noop */
				},
			}),
		).toBe(false);
		expect(isJsonSerializable([undefined])).toBe(false);
		expect(isJsonSerializable({ nested: { sym: Symbol("x") } })).toBe(false);
	});

	// ----- Edge: objects with null prototype -----
	it("returns true for objects with null prototype", () => {
		const obj = Object.create(null);
		obj.key = "value";
		expect(isJsonSerializable(obj)).toBe(true);
	});

	// ----- DAGs (shared but acyclic references) -----
	it("returns true for shared object references in a DAG", () => {
		const shared = { name: "shared" };
		expect(isJsonSerializable({ a: shared, b: shared })).toBe(true);
	});

	it("returns true for shared array references in a DAG", () => {
		const shared = [1, 2, 3];
		expect(isJsonSerializable({ a: shared, b: shared })).toBe(true);
	});

	it("returns true when the same object appears multiple times in an array", () => {
		const shared = { foo: "bar" };
		expect(isJsonSerializable([shared, shared, shared])).toBe(true);
	});

	// ----- Genuine cycles still rejected -----
	it("returns false for self-referencing objects", () => {
		const obj: Record<string, unknown> = {};
		obj.self = obj;
		expect(isJsonSerializable(obj)).toBe(false);
	});

	it("returns false for self-referencing arrays", () => {
		const arr: unknown[] = [];
		arr.push(arr);
		expect(isJsonSerializable(arr)).toBe(false);
	});

	it("returns false for indirect cycles", () => {
		const a: Record<string, unknown> = {};
		const b: Record<string, unknown> = { a };
		a.b = b;
		expect(isJsonSerializable(a)).toBe(false);
	});
});
