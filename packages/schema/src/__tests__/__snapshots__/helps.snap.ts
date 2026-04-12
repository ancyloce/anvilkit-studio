import type { AiComponentSchema } from "@anvilkit/core/types";

export const helps: AiComponentSchema = {
	componentName: "Helps",
	description: "",
	fields: [
		{
			name: "avatars",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description: "Object with fields: name, imageUrl, initials",
			},
		},
		{
			name: "buttonHref",
			type: "text",
		},
		{
			name: "buttonLabel",
			type: "text",
		},
		{
			name: "buttonOpenInNewTab",
			type: "select",
			options: [
				{ label: "No", value: "false" },
				{ label: "Yes", value: "true" },
			],
		},
		{
			name: "message",
			type: "text",
		},
		{
			name: "sidebar",
			type: "object",
			description:
				"Slot field — accepts nested child components. Disallowed: Navbar.",
		},
	],
};
