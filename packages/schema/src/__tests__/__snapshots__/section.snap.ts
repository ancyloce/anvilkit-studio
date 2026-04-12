import type { AiComponentSchema } from "@anvilkit/core/types";

export const section: AiComponentSchema = {
	componentName: "Section",
	description: "",
	fields: [
		{
			name: "badgeLabel",
			type: "text",
		},
		{
			name: "content",
			type: "object",
			description:
				"Slot field — accepts nested child components. Allowed: Hero, Statistics.",
		},
		{
			name: "description",
			type: "text",
		},
		{
			name: "headline",
			type: "text",
		},
		{
			name: "highlightedHeadline",
			type: "text",
		},
	],
};
