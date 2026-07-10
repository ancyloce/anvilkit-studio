import { describe, expect, it } from "vitest";
import { invariant } from "./invariant.js";

describe("invariant", () => {
	it("does not throw on truthy conditions", () => {
		expect(() => invariant(true, "truthy")).not.toThrow();
		expect(() => invariant(1, "number")).not.toThrow();
		expect(() => invariant("non-empty", "string")).not.toThrow();
		expect(() => invariant({}, "object")).not.toThrow();
		expect(() => invariant([], "array")).not.toThrow();
	});

	it("throws an Error with the given message on falsy conditions", () => {
		expect(() => invariant(false, "should be true")).toThrowError(
			new Error("should be true"),
		);
		expect(() => invariant(0, "non-zero required")).toThrowError(
			"non-zero required",
		);
		expect(() => invariant(null, "not null")).toThrowError("not null");
		expect(() => invariant(undefined, "defined")).toThrowError("defined");
		expect(() => invariant("", "non-empty string")).toThrowError(
			"non-empty string",
		);
	});

	it("narrows the type of the asserted value for the caller", () => {
		const value: string | undefined = "present";
		invariant(value, "value must be present");
		// If `value` were not narrowed, this line would be a TS error.
		const length: number = value.length;
		expect(length).toBe(7);
	});
});
