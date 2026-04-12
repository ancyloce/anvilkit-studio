import type { AiFieldSchema } from "@anvilkit/core/types";
import type { Field } from "@puckeditor/core";

const MAX_DEPTH = 8;

export interface ExtractFieldSchemaOptions {
	required?: boolean;
	description?: string;
}

export function extractFieldSchema(
	name: string,
	field: Field,
	opts?: ExtractFieldSchemaOptions,
	_depth?: number,
): AiFieldSchema {
	const depth = _depth ?? 0;
	if (depth > MAX_DEPTH) {
		throw new Error(
			`[@anvilkit/schema] Max recursion depth (${MAX_DEPTH}) exceeded at field "${name}". Check for cyclic field definitions.`,
		);
	}

	const base: { name: string; required?: boolean; description?: string } = {
		name,
		...(opts?.required != null ? { required: opts.required } : {}),
		...(opts?.description
			? { description: opts.description }
			: field.label
				? { description: field.label }
				: {}),
	};

	switch (field.type) {
		case "text":
			return { ...base, type: "text" };

		case "textarea":
			return { ...base, type: "text" };

		case "richtext":
			return { ...base, type: "richtext" };

		case "number":
			return { ...base, type: "number" };

		case "select":
		case "radio": {
			const options = Array.isArray(field.options)
				? field.options.map((opt) => ({
						label: String(opt.label),
						value: String(opt.value),
					}))
				: undefined;
			return { ...base, type: "select", ...(options ? { options } : {}) };
		}

		case "array": {
			const arrayFields = (field as { arrayFields?: Record<string, Field> })
				.arrayFields;
			if (arrayFields && typeof arrayFields === "object") {
				const itemFields: AiFieldSchema[] = [];
				for (const [key, subField] of Object.entries(arrayFields)) {
					itemFields.push(
						extractFieldSchema(key, subField as Field, undefined, depth + 1),
					);
				}
				if (itemFields.length === 1) {
					return { ...base, type: "array", itemSchema: itemFields[0] };
				}
				if (itemFields.length > 1) {
					return {
						...base,
						type: "array",
						itemSchema: {
							name: "item",
							type: "object",
							description: `Object with fields: ${itemFields.map((f) => f.name).join(", ")}`,
						},
					};
				}
			}
			return { ...base, type: "array" };
		}

		case "object": {
			const objectFields = (field as { objectFields?: Record<string, Field> })
				.objectFields;
			if (objectFields && typeof objectFields === "object") {
				const subFields: AiFieldSchema[] = [];
				for (const [key, subField] of Object.entries(objectFields)) {
					subFields.push(
						extractFieldSchema(key, subField as Field, undefined, depth + 1),
					);
				}
				if (subFields.length > 0) {
					return {
						...base,
						type: "object",
						itemSchema: {
							name: "properties",
							type: "object",
							description: `Object with fields: ${subFields.map((f) => f.name).join(", ")}`,
						},
					};
				}
			}
			return { ...base, type: "object" };
		}

		case "external":
			return {
				...base,
				type: "object",
				description:
					base.description ??
					"External data source. The LLM cannot generate values for this field directly.",
			};

		case "custom":
			return {
				...base,
				type: "text",
				description:
					base.description ??
					"Custom field with a bespoke renderer. The LLM cannot generate values for this field.",
			};

		case "slot":
			return {
				...base,
				type: "object",
				description: `Slot field — accepts nested child components.${
					(field as { allow?: string[] }).allow
						? ` Allowed: ${(field as { allow?: string[] }).allow!.join(", ")}.`
						: ""
				}${
					(field as { disallow?: string[] }).disallow
						? ` Disallowed: ${(field as { disallow?: string[] }).disallow!.join(", ")}.`
						: ""
				}`,
			};

		default:
			return {
				...base,
				type: "text",
				description:
					base.description ??
					`Unknown Puck field type "${(field as { type: string }).type}". Treated as text.`,
			};
	}
}
