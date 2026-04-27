import type {
	AiComponentSchema,
	AiFieldSchema,
	AiGenerationContext,
} from "@anvilkit/core/types";
import type { Config } from "@puckeditor/core";

import { extractFieldSchema } from "./extract-field-schema.js";

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

	if (opts?.include) {
		const missing = opts.include.filter((name) => !(name in components));
		if (missing.length > 0) {
			throw new Error(
				`[@anvilkit/schema] configToAiContext: include[] references components not present in config: ${missing.join(", ")}`,
			);
		}
	}

	const includeSet = opts?.include ? new Set(opts.include) : undefined;

	const componentNames = Object.keys(components)
		.filter((name) => !includeSet || includeSet.has(name))
		.sort((a, b) => a.localeCompare(b));

	const availableComponents: AiComponentSchema[] = componentNames.map((name) => {
		const component = components[name]!;
		const fields: AiFieldSchema[] = Object.entries(component.fields ?? {})
			.map(([fieldKey, field]) => extractFieldSchema(fieldKey, field))
			.sort((a, b) => a.name.localeCompare(b.name));

		return {
			componentName: name,
			description: component.metadata?.description ?? "",
			fields,
		};
	});

	return { availableComponents };
}
