import type {
	AiComponentSchema,
	AiFieldSchema,
	AiGenerationContext,
} from "@anvilkit/core/types";
import type { Config } from "@puckeditor/core";

import { extractFieldSchema } from "./extract-field-schema.js";
import { identifySlotFields } from "./identify-slot-fields.js";

type ExtractableField = Parameters<typeof extractFieldSchema>[1];

type SchemaComponentConfig = {
	fields?: Record<string, ExtractableField>;
	metadata?: {
		description?: string;
	};
};

export interface ConfigToAiContextOptions {
	include?: string[];
}

export function configToAiContext<C extends Config>(
	config: C,
	opts?: ConfigToAiContextOptions,
): AiGenerationContext {
	const components = (config.components ?? {}) as Record<
		string,
		SchemaComponentConfig
	>;
	const includeSet = opts?.include ? new Set(opts.include) : undefined;
	const slotFieldsByComponent = identifySlotFields(config);
	const availableComponents: AiComponentSchema[] = [];

	for (const componentName of slotFieldsByComponent.keys()) {
		if (includeSet && !includeSet.has(componentName)) {
			continue;
		}

		const component = components[componentName];

		if (!component) {
			continue;
		}

		const fields: AiFieldSchema[] = Object.entries(component.fields ?? {})
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([fieldKey, field]) => extractFieldSchema(fieldKey, field))
			.sort((a, b) => a.name.localeCompare(b.name));

		availableComponents.push({
			componentName,
			description: component.metadata?.description ?? "",
			fields,
		});
	}

	availableComponents.sort((a, b) =>
		a.componentName.localeCompare(b.componentName),
	);

	return { availableComponents };
}
