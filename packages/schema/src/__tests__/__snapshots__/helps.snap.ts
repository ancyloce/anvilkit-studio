import type { AiComponentSchema } from "@anvilkit/core/types";

export const helps: AiComponentSchema = {
	"componentName": "Helps",
	"description": "",
	"fields": [
		{
			"name": "avatars",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "imageUrl",
						"type": "text"
					},
					{
						"name": "initials",
						"type": "text"
					},
					{
						"name": "name",
						"type": "text"
					}
				]
			}
		},
		{
			"name": "buttonHref",
			"type": "text"
		},
		{
			"name": "buttonLabel",
			"type": "text"
		},
		{
			"name": "buttonOpenInNewTab",
			"type": "boolean"
		},
		{
			"name": "message",
			"type": "text"
		},
		{
			"name": "sidebar",
			"type": "object",
			"description": "Slot field — accepts nested child components.",
			"disallow": [
				"Navbar"
			]
		}
	]
};
