import type { AiComponentSchema } from "@anvilkit/core/types";

export const blogList: AiComponentSchema = {
	componentName: "BlogList",
	description: "",
	fields: [
		{
			name: "posts",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description:
					"Object with fields: title, description, href, openInNewTab, imageSrc, imageAlt, publishedAt, publishedLabel, relativeLabel",
			},
		},
	],
};
