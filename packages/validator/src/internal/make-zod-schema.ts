import type { AiFieldSchema } from "@anvilkit/core/types";
import { z } from "zod";

const MAX_DEPTH = 16;

export function makeZodSchemaForField(
	field: AiFieldSchema,
	depth?: number,
): z.ZodType {
	const d = depth ?? 0;
	if (d > MAX_DEPTH) {
		return z.unknown();
	}

	let schema: z.ZodType;

	switch (field.type) {
		case "text":
		case "richtext":
		case "image":
		case "url":
		case "color":
			schema = z.string();
			break;
		case "number":
			schema = z.number();
			break;
		case "boolean":
			schema = z.boolean();
			break;
		case "select": {
			if (field.options && field.options.length > 0) {
				const values = field.options.map((o: { value: string }) => o.value);
				if (values.length === 1) {
					schema = z.literal(values[0]);
				} else {
					schema = z.enum(values as [string, ...string[]]);
				}
			} else {
				schema = z.string();
			}
			break;
		}
		case "array": {
			if (field.itemSchema) {
				schema = z.array(makeZodSchemaForField(field.itemSchema, d + 1));
			} else {
				schema = z.array(z.unknown());
			}
			break;
		}
		case "object": {
			schema = z.record(z.string(), z.unknown());
			break;
		}
		default:
			schema = z.unknown();
			break;
	}

	if (field.required !== true) {
		schema = schema.optional();
	}

	return schema;
}

const componentSchemaCache = new Map<string, z.ZodType>();

export function makeComponentPropsSchema(
	fields: readonly AiFieldSchema[],
	cacheKey?: string,
): z.ZodType {
	if (cacheKey && componentSchemaCache.has(cacheKey)) {
		return componentSchemaCache.get(cacheKey)!;
	}

	const shape: Record<string, z.ZodType> = {};
	for (const field of fields) {
		shape[field.name] = makeZodSchemaForField(field);
	}

	const schema = z.object(shape).passthrough();

	if (cacheKey) {
		componentSchemaCache.set(cacheKey, schema);
	}

	return schema;
}

export function clearSchemaCache(): void {
	componentSchemaCache.clear();
}
