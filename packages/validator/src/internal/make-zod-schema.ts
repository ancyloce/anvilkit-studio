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
import { MAX_NODE_DEPTH } from "./constants.js";

export function makeZodSchemaForField(
	field: AiFieldSchema,
	depth?: number,
): ZodMiniType {
	const d = depth ?? 0;
	if (d > MAX_NODE_DEPTH) {
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

export function makeComponentPropsSchema(
	fields: readonly AiFieldSchema[],
): ZodMiniType {
	const shape: Record<string, ZodMiniType> = {};
	for (const field of fields) {
		shape[field.name] = makeZodSchemaForField(field);
	}
	return looseObject(shape);
}
