import type { AiComponentSchema } from "@anvilkit/core/types";

export const bentoGrid: AiComponentSchema = {
	componentName: "BentoGrid",
	description: "",
	fields: [
		{
			name: "children",
			type: "object",
			description: "Slot field — accepts nested child components.",
		},
		{
			name: "items",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description:
					"Object with fields: icon, title, description, size, rounded, background, ctaLabel, ctaHref, ctaOpenInNewTab",
			},
		},
		{
			name: "platform",
			type: "select",
			options: [
				{ label: "Adaptive", value: "adaptive" },
				{ label: "Mobile", value: "mobile" },
				{ label: "Tablet", value: "tablet" },
				{ label: "Desktop", value: "desktop" },
			],
		},
		{
			name: "theme",
			type: "select",
			options: [
				{ label: "System", value: "system" },
				{ label: "Light", value: "light" },
				{ label: "Dark", value: "dark" },
			],
		},
	],
};
