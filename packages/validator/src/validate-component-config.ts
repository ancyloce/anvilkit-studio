import { isJsonSerializable } from "@anvilkit/schema";
import type { Config } from "@puckeditor/core";
import {
	knownFieldTypeSet,
	makeFieldZodSchema,
} from "./internal/make-field-zod-schema.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

const fieldSchema = makeFieldZodSchema();

function isObjectLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function validateComponentConfig<C extends Config>(
	config: C,
): ValidationResult {
	const issues: ValidationIssue[] = [];
	const components = (config.components ?? {}) as Record<
		string,
		Record<string, unknown>
	>;

	for (const [componentName, componentConfig] of Object.entries(components)) {
		const renderValue = componentConfig.render;

		if (typeof renderValue !== "function") {
			issues.push({
				level: "error",
				code: "E_MISSING_RENDER",
				message: `Component "${componentName}" is missing a render function.`,
				path: ["components", componentName, "render"],
				componentName,
			});
		} else if (renderValue.constructor?.name === "AsyncFunction") {
			issues.push({
				level: "error",
				code: "E_ASYNC_RENDER",
				message: `Component "${componentName}" uses an async render function, which Puck does not support.`,
				path: ["components", componentName, "render"],
				componentName,
			});
		}

		const fieldsValue = componentConfig.fields;

		if (!isObjectLike(fieldsValue)) {
			issues.push({
				level: "error",
				code: "E_MISSING_FIELDS",
				message: `Component "${componentName}" is missing a fields object.`,
				path: ["components", componentName, "fields"],
				componentName,
			});
		} else {
			for (const [fieldName, fieldDef] of Object.entries(fieldsValue)) {
				const parsedField = fieldSchema.safeParse(fieldDef);

				if (!parsedField.success) {
					issues.push({
						level: "error",
						code: "E_FIELD_SHAPE_INVALID",
						message: `Field "${fieldName}" in "${componentName}" does not match the Puck field shape.`,
						path: ["components", componentName, "fields", fieldName],
						componentName,
					});
				}

				if (isObjectLike(fieldDef) && typeof fieldDef.type === "string") {
					if (!knownFieldTypeSet.has(fieldDef.type)) {
						issues.push({
							level: "warning",
							code: "W_UNKNOWN_FIELD_TYPE",
							message: `Field "${fieldName}" in "${componentName}" has unknown type "${fieldDef.type}".`,
							path: ["components", componentName, "fields", fieldName, "type"],
							componentName,
						});
					}
				}
			}
		}

		const defaultPropsValue = componentConfig.defaultProps;

		if (isObjectLike(defaultPropsValue)) {
			for (const [propName, propValue] of Object.entries(defaultPropsValue)) {
				if (!isJsonSerializable(propValue)) {
					issues.push({
						level: "error",
						code: "E_NON_SERIALIZABLE_DEFAULT",
						message: `Default prop "${propName}" in "${componentName}" is not JSON-serializable.`,
						path: ["components", componentName, "defaultProps", propName],
						componentName,
					});
				}
			}
		}

		const metadataValue = componentConfig.metadata;
		const descriptionValue = isObjectLike(metadataValue)
			? metadataValue.description
			: undefined;

		if (typeof descriptionValue !== "string" || descriptionValue.length === 0) {
			issues.push({
				level: "warning",
				code: "W_MISSING_DESCRIPTION",
				message: `Component "${componentName}" is missing a description in its metadata.`,
				path: ["components", componentName, "metadata", "description"],
				componentName,
			});
		}
	}

	return {
		valid: issues.every((issue) => issue.level !== "error"),
		issues,
	};
}
