import type { Field } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { extractFieldSchema } from "../extract-field-schema.js";

describe("extractFieldSchema", () => {
	// ----- 1. text -----
	it("maps Puck text field to AiFieldType text", () => {
		const field: Field = { type: "text" };
		const result = extractFieldSchema("title", field);
		expect(result.name).toBe("title");
		expect(result.type).toBe("text");
	});

	// ----- 2. textarea → text -----
	it("maps Puck textarea field to AiFieldType text", () => {
		const field: Field = { type: "textarea" };
		const result = extractFieldSchema("description", field);
		expect(result.name).toBe("description");
		expect(result.type).toBe("text");
	});

	// ----- 3. richtext -----
	it("maps Puck richtext field to AiFieldType richtext", () => {
		const field: Field = { type: "richtext" };
		const result = extractFieldSchema("body", field);
		expect(result.type).toBe("richtext");
	});

	// ----- 4. number -----
	it("maps Puck number field to AiFieldType number", () => {
		const field: Field = { type: "number" };
		const result = extractFieldSchema("count", field);
		expect(result.type).toBe("number");
	});

	// ----- 5. select -----
	it("maps Puck select field to AiFieldType select with options", () => {
		const field: Field = {
			type: "select",
			options: [
				{ label: "Small", value: "sm" },
				{ label: "Large", value: "lg" },
			],
		};
		const result = extractFieldSchema("size", field);
		expect(result.type).toBe("select");
		expect(result.options).toEqual([
			{ label: "Small", value: "sm" },
			{ label: "Large", value: "lg" },
		]);
	});

	// ----- 6. radio → select -----
	it("maps Puck radio field to AiFieldType select with options", () => {
		const field: Field = {
			type: "radio",
			options: [
				{ label: "Yes", value: true },
				{ label: "No", value: false },
			],
		};
		const result = extractFieldSchema("enabled", field);
		expect(result.type).toBe("select");
		expect(result.options).toEqual([
			{ label: "Yes", value: "true" },
			{ label: "No", value: "false" },
		]);
	});

	// ----- 7. array -----
	it("maps Puck array field to AiFieldType array with itemSchema", () => {
		const field: Field = {
			type: "array",
			arrayFields: {
				label: { type: "text" } as Field,
			},
		};
		const result = extractFieldSchema("features", field);
		expect(result.type).toBe("array");
		expect(result.itemSchema).toBeDefined();
		expect(result.itemSchema!.name).toBe("label");
		expect(result.itemSchema!.type).toBe("text");
	});

	// ----- 8. object -----
	it("maps Puck object field to AiFieldType object with itemSchema", () => {
		const field: Field = {
			type: "object",
			objectFields: {
				text: { type: "text" } as Field,
				href: { type: "text" } as Field,
			},
		};
		const result = extractFieldSchema("logo", field);
		expect(result.type).toBe("object");
		expect(result.itemSchema).toBeDefined();
		expect(result.itemSchema!.type).toBe("object");
	});

	// ----- 9. external -----
	it("maps Puck external field to AiFieldType object with description", () => {
		const field = { type: "external" } as Field;
		const result = extractFieldSchema("data", field);
		expect(result.type).toBe("object");
		expect(result.description).toContain("External data source");
	});

	// ----- 10. custom -----
	it("maps Puck custom field to AiFieldType text with warning", () => {
		const field = {
			type: "custom",
			render: () => null,
		} as unknown as Field;
		const result = extractFieldSchema("widget", field);
		expect(result.type).toBe("text");
		expect(result.description).toContain("Custom field");
	});

	// ----- 11. slot -----
	it("maps Puck slot field to AiFieldType object with slot description", () => {
		const field: Field = {
			type: "slot",
			allow: ["Hero", "Button"],
		};
		const result = extractFieldSchema("content", field);
		expect(result.type).toBe("object");
		expect(result.description).toContain("Slot");
		expect(result.description).toContain("Hero");
		expect(result.description).toContain("Button");
	});

	// ----- Recursion depth guard -----
	it("throws when max recursion depth is exceeded", () => {
		// Build a deeply nested array field (9 levels deep)
		let field: Field = { type: "text" };
		for (let i = 0; i < 10; i++) {
			field = {
				type: "array",
				arrayFields: { nested: field },
			} as unknown as Field;
		}
		expect(() => extractFieldSchema("deep", field)).toThrow(
			"Max recursion depth",
		);
	});

	// ----- label → description -----
	it("uses field label as description when present", () => {
		const field: Field = { type: "text", label: "Page Title" };
		const result = extractFieldSchema("title", field);
		expect(result.description).toBe("Page Title");
	});

	// ----- opts.required -----
	it("passes through opts.required", () => {
		const field: Field = { type: "text" };
		const result = extractFieldSchema("title", field, { required: true });
		expect(result.required).toBe(true);
	});

	// ----- opts.description overrides label -----
	it("opts.description overrides field label", () => {
		const field: Field = { type: "text", label: "From label" };
		const result = extractFieldSchema("title", field, {
			description: "From opts",
		});
		expect(result.description).toBe("From opts");
	});

	// ----- Output is JSON serializable -----
	it("produces JSON-serializable output for all field types", () => {
		const fields: Field[] = [
			{ type: "text" },
			{ type: "textarea" },
			{ type: "richtext" },
			{ type: "number" },
			{ type: "select", options: [{ label: "A", value: "a" }] },
			{ type: "radio", options: [{ label: "B", value: "b" }] },
			{
				type: "array",
				arrayFields: { x: { type: "text" } as Field },
			} as unknown as Field,
			{
				type: "object",
				objectFields: { y: { type: "text" } as Field },
			} as unknown as Field,
		];
		for (const f of fields) {
			const schema = extractFieldSchema("test", f);
			expect(() => JSON.stringify(schema)).not.toThrow();
		}
	});

	// ----- No react references -----
	it("output contains no React references", () => {
		const field: Field = {
			type: "select",
			options: [{ label: "A", value: "a" }],
		};
		const result = extractFieldSchema("test", field);
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain("createElement");
		expect(serialized).not.toContain("React");
	});

	// ----- Array with multiple arrayFields -----
	it("handles array field with multiple sub-fields", () => {
		const field: Field = {
			type: "array",
			arrayFields: {
				name: { type: "text" } as Field,
				count: { type: "number" } as Field,
			},
		} as unknown as Field;
		const result = extractFieldSchema("items", field);
		expect(result.type).toBe("array");
		expect(result.itemSchema).toBeDefined();
		expect(result.itemSchema!.type).toBe("object");
		expect(result.itemSchema!.description).toContain("name");
		expect(result.itemSchema!.description).toContain("count");
	});

	// ----- Slot with disallow -----
	it("includes disallowed components in slot description", () => {
		const field: Field = {
			type: "slot",
			disallow: ["Footer"],
		};
		const result = extractFieldSchema("body", field);
		expect(result.description).toContain("Disallowed");
		expect(result.description).toContain("Footer");
	});
});
