/**
 * @file Tests for option-id helpers and the 2026-05-17 review finding
 * P2: object option values must be matched structurally, not by
 * reference, so persisted/remote/collaborative data reconstructed as a new
 * object still selects the configured option.
 */

import { describe, expect, it } from "vitest";
import {
	findOptionIndex,
	optionId,
	optionIndexFromId,
	structuralEqual,
} from "@/overrides/fields/field-types/option-ids";

describe("optionId / optionIndexFromId", () => {
	it("round-trips an index", () => {
		expect(optionIndexFromId(optionId(3))).toBe(3);
	});
	it("rejects foreign ids", () => {
		expect(optionIndexFromId("not-an-option")).toBeNull();
		expect(optionIndexFromId("option:-1")).toBeNull();
	});
});

describe("structuralEqual", () => {
	it("matches primitives and same references", () => {
		expect(structuralEqual("a", "a")).toBe(true);
		expect(structuralEqual(1, 1)).toBe(true);
		const ref = { x: 1 };
		expect(structuralEqual(ref, ref)).toBe(true);
	});
	it("matches structurally-equal objects regardless of key order", () => {
		expect(structuralEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
	});
	it("matches nested objects and arrays", () => {
		expect(structuralEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(
			true,
		);
	});
	it("rejects different shapes/values", () => {
		expect(structuralEqual({ a: 1 }, { a: 2 })).toBe(false);
		expect(structuralEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		expect(structuralEqual([1, 2], [1, 2, 3])).toBe(false);
		expect(structuralEqual({ a: 1 }, null)).toBe(false);
	});
});

describe("findOptionIndex", () => {
	it("finds primitive values (unchanged behavior)", () => {
		const options = [{ value: "x" }, { value: "y" }];
		expect(findOptionIndex(options, "y")).toBe(1);
		expect(findOptionIndex(options, "z")).toBe(-1);
	});

	it("finds an object value after cloning creates a new reference", () => {
		const original = { region: "us", tier: { plan: "pro" } };
		const options = [{ value: { region: "eu" } }, { value: original }];
		// Simulates persisted/remote data: same shape, new reference.
		const cloned = structuredClone(original);
		expect(Object.is(options[1]?.value, cloned)).toBe(false);
		expect(findOptionIndex(options, cloned)).toBe(1);
	});

	it("does not match a structurally-different object", () => {
		const options = [{ value: { region: "us" } }];
		expect(findOptionIndex(options, { region: "eu" })).toBe(-1);
	});

	it("matches array-valued options structurally", () => {
		const options = [{ value: [1, 2] }, { value: [3, 4] }];
		expect(findOptionIndex(options, [3, 4])).toBe(1);
	});
});
