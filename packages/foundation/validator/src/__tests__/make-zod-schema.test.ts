import { describe, expect, it } from "vitest";
import { z } from "zod/mini";
import { makeZodSchemaForField } from "../internal/make-zod-schema.js";

describe("makeZodSchemaForField", () => {
	it("maps text to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "title",
			type: "text",
			required: true,
		});
		expect(z.safeParse(schema, "hello").success).toBe(true);
		expect(z.safeParse(schema, 42).success).toBe(false);
	});

	it("maps richtext to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "body",
			type: "richtext",
			required: true,
		});
		expect(z.safeParse(schema, "<p>hi</p>").success).toBe(true);
	});

	it("maps number to z.number()", () => {
		const schema = makeZodSchemaForField({
			name: "count",
			type: "number",
			required: true,
		});
		expect(z.safeParse(schema, 42).success).toBe(true);
		expect(z.safeParse(schema, "42").success).toBe(false);
	});

	it("maps boolean to z.boolean()", () => {
		const schema = makeZodSchemaForField({
			name: "active",
			type: "boolean",
			required: true,
		});
		expect(z.safeParse(schema, true).success).toBe(true);
		expect(z.safeParse(schema, "true").success).toBe(false);
	});

	it("maps image to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "src",
			type: "image",
			required: true,
		});
		expect(z.safeParse(schema, "https://img.png").success).toBe(true);
	});

	it("maps url to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "href",
			type: "url",
			required: true,
		});
		expect(z.safeParse(schema, "https://example.com").success).toBe(true);
	});

	it("maps color to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "bg",
			type: "color",
			required: true,
		});
		expect(z.safeParse(schema, "#ff0000").success).toBe(true);
	});

	it("maps select with options to z.enum()", () => {
		const schema = makeZodSchemaForField({
			name: "size",
			type: "select",
			required: true,
			options: [
				{ label: "Small", value: "sm" },
				{ label: "Large", value: "lg" },
			],
		});
		expect(z.safeParse(schema, "sm").success).toBe(true);
		expect(z.safeParse(schema, "xl").success).toBe(false);
	});

	it("maps select without options to z.string()", () => {
		const schema = makeZodSchemaForField({
			name: "variant",
			type: "select",
			required: true,
		});
		expect(z.safeParse(schema, "anything").success).toBe(true);
	});

	it("maps array with itemSchema", () => {
		const schema = makeZodSchemaForField({
			name: "items",
			type: "array",
			required: true,
			itemSchema: { name: "label", type: "text", required: true },
		});
		expect(z.safeParse(schema, ["a", "b"]).success).toBe(true);
		expect(z.safeParse(schema, [1, 2]).success).toBe(false);
	});

	it("maps array without itemSchema to z.array(z.unknown())", () => {
		const schema = makeZodSchemaForField({
			name: "items",
			type: "array",
			required: true,
		});
		expect(z.safeParse(schema, [1, "two", true]).success).toBe(true);
	});

	it("maps object to z.record()", () => {
		const schema = makeZodSchemaForField({
			name: "data",
			type: "object",
			required: true,
		});
		expect(z.safeParse(schema, { a: 1 }).success).toBe(true);
	});

	it("makes non-required fields optional", () => {
		const schema = makeZodSchemaForField({ name: "title", type: "text" });
		expect(z.safeParse(schema, undefined).success).toBe(true);
		expect(z.safeParse(schema, "hello").success).toBe(true);
	});

	it("handles recursive array of objects", () => {
		const schema = makeZodSchemaForField({
			name: "items",
			type: "array",
			required: true,
			itemSchema: {
				name: "item",
				type: "object",
				required: true,
			},
		});
		expect(z.safeParse(schema, [{ a: 1 }, { b: 2 }]).success).toBe(true);
	});
});
