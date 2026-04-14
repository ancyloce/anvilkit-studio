import type { AiFieldSchema } from "@anvilkit/core/types";
import {
	array,
	boolean,
	enum as enumSchema,
	literal,
	looseObject,
	number,
	optional,
	record,
	string,
	type ZodMiniType,
	unknown,
} from "zod/mini";

const MAX_DEPTH = 16;

export function makeZodSchemaForField(
	field: AiFieldSchema,
	depth?: number,
): ZodMiniType {
	const d = depth ?? 0;
	if (d > MAX_DEPTH) {
		return unknown();
	}

	let schema: ZodMiniType;

	switch (field.type) {
		case "text":
		case "richtext":
		case "image":
		case "url":
		case "color":
			schema = string();
			break;
		case "number":
			schema = number();
			break;
		case "boolean":
			schema = boolean();
			break;
		case "select": {
			if (field.options && field.options.length > 0) {
				const values = field.options.map((o: { value: string }) => o.value);
				if (values.length === 1) {
					schema = literal(values[0]);
				} else {
					schema = enumSchema(values as [string, ...string[]]);
				}
			} else {
				schema = string();
			}
			break;
		}
		case "array": {
			if (field.itemSchema) {
				schema = array(makeZodSchemaForField(field.itemSchema, d + 1));
			} else {
				schema = array(unknown());
			}
			break;
		}
		case "object": {
			schema = record(string(), unknown());
			break;
		}
		default:
			schema = unknown();
			break;
	}

	if (field.required !== true) {
		schema = optional(schema);
	}

	return schema;
}

const componentSchemaCache = new Map<string, ZodMiniType>();

export function makeComponentPropsSchema(
	fields: readonly AiFieldSchema[],
	cacheKey?: string,
): ZodMiniType {
	if (cacheKey && componentSchemaCache.has(cacheKey)) {
		return componentSchemaCache.get(cacheKey)!;
	}

	const shape: Record<string, ZodMiniType> = {};
	for (const field of fields) {
		shape[field.name] = makeZodSchemaForField(field);
	}

	const schema = looseObject(shape);

	if (cacheKey) {
		componentSchemaCache.set(cacheKey, schema);
	}

	return schema;
}

export function clearSchemaCache(): void {
	componentSchemaCache.clear();
}
