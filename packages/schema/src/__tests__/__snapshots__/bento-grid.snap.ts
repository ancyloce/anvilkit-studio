import type { AiComponentSchema } from "@anvilkit/core/types";

export const bentoGrid: AiComponentSchema = {
	"componentName": "BentoGrid",
	"description": "",
	"fields": [
		{
			"name": "children",
			"type": "object",
			"description": "Slot field — accepts nested child components."
		},
		{
			"name": "items",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "background",
						"type": "select",
						"options": []
					},
					{
						"name": "ctaHref",
						"type": "text"
					},
					{
						"name": "ctaLabel",
						"type": "text"
					},
					{
						"name": "ctaOpenInNewTab",
						"type": "select",
						"options": []
					},
					{
						"name": "description",
						"type": "text"
					},
					{
						"name": "icon",
						"type": "select",
						"options": []
					},
					{
						"name": "rounded",
						"type": "select",
						"options": []
					},
					{
						"name": "size",
						"type": "select",
						"options": []
					},
					{
						"name": "title",
						"type": "text"
					}
				]
			}
		},
		{
			"name": "platform",
			"type": "select",
			"options": [
				{
					"label": "Adaptive",
					"value": "adaptive"
				},
				{
					"label": "Mobile",
					"value": "mobile"
				},
				{
					"label": "Tablet",
					"value": "tablet"
				},
				{
					"label": "Desktop",
					"value": "desktop"
				}
			]
		},
		{
			"name": "theme",
			"type": "select",
			"options": [
				{
					"label": "System",
					"value": "system"
				},
				{
					"label": "Light",
					"value": "light"
				},
				{
					"label": "Dark",
					"value": "dark"
				}
			]
		}
	]
};
