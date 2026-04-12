import type { AiComponentSchema } from "@anvilkit/core/types";

export const navbar: AiComponentSchema = {
	componentName: "Navbar",
	description: "",
	fields: [
		{
			name: "actions",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description:
					"Object with fields: label, href, variant, size, openInNewTab, disabled",
			},
		},
		{
			name: "active",
			type: "text",
		},
		{
			name: "items",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description: "Object with fields: label, href",
			},
		},
		{
			name: "logo",
			type: "object",
			itemSchema: {
				name: "properties",
				type: "object",
				description: "Object with fields: type, text, imageUrl, alt, href",
			},
		},
	],
};
