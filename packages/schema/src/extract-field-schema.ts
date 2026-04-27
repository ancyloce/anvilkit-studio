import type { AiFieldSchema } from "@anvilkit/core/types";
import type { Field } from "@puckeditor/core";

// Per-tree depth budget. Mirrors @anvilkit/validator's MAX_DEPTH so a
// schema this package emits is always parseable by the validator.
// Bumping this is a contract change.
const MAX_DEPTH = 16;

export interface ExtractFieldSchemaOptions {
	required?: boolean;
	description?: string;
}

export function extractFieldSchema(
	name: string,
	field: Field,
	opts?: ExtractFieldSchemaOptions,
): AiFieldSchema {
	return extractFieldSchemaInner(name, field, opts, 0);
}

function extractFieldSchemaInner(
	name: string,
	field: Field,
	opts: ExtractFieldSchemaOptions | undefined,
	depth: number,
): AiFieldSchema {
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
			const rawOptions = Array.isArray(field.options) ? field.options : undefined;

			if (
				rawOptions &&
				rawOptions.length > 0 &&
				rawOptions.every((opt) => typeof opt.value === "boolean")
			) {
				return { ...base, type: "boolean" };
			}

			const options = rawOptions
				? rawOptions.map((opt) => ({
						label: String(opt.label),
						value: String(opt.value),
					}))
				: undefined;
			return { ...base, type: "select", ...(options ? { options } : {}) };
		}

		case "array": {
			const arrayFields = (field as { arrayFields?: Record<string, Field> })
				.arrayFields;
			if (
				arrayFields &&
				typeof arrayFields === "object" &&
				!Array.isArray(arrayFields)
			) {
				const itemFields: AiFieldSchema[] = Object.entries(arrayFields)
					.map(([key, subField]) =>
						extractFieldSchemaInner(key, subField as Field, undefined, depth + 1),
					)
					.sort((a, b) => a.name.localeCompare(b.name));

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
							properties: itemFields,
						},
					};
				}
			}
			return { ...base, type: "array" };
		}

		case "object": {
			const objectFields = (field as { objectFields?: Record<string, Field> })
				.objectFields;
			if (
				objectFields &&
				typeof objectFields === "object" &&
				!Array.isArray(objectFields)
			) {
				const subFields: AiFieldSchema[] = Object.entries(objectFields)
					.map(([key, subField]) =>
						extractFieldSchemaInner(key, subField as Field, undefined, depth + 1),
					)
					.sort((a, b) => a.name.localeCompare(b.name));

				if (subFields.length > 0) {
					return {
						...base,
						type: "object",
						properties: subFields,
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

		case "slot": {
			const allow = (field as { allow?: string[] }).allow;
			const disallow = (field as { disallow?: string[] }).disallow;
			return {
				...base,
				type: "object",
				description: "Slot field — accepts nested child components.",
				...(Array.isArray(allow) && allow.length > 0
					? { allow: [...allow] }
					: {}),
				...(Array.isArray(disallow) && disallow.length > 0
					? { disallow: [...disallow] }
					: {}),
			};
		}

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
