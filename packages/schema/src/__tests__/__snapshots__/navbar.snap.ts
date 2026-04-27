import type { AiComponentSchema } from "@anvilkit/core/types";

export const navbar: AiComponentSchema = {
	"componentName": "Navbar",
	"description": "",
	"fields": [
		{
			"name": "actions",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "disabled",
						"type": "select",
						"options": []
					},
					{
						"name": "href",
						"type": "text"
					},
					{
						"name": "label",
						"type": "text"
					},
					{
						"name": "openInNewTab",
						"type": "select",
						"options": []
					},
					{
						"name": "size",
						"type": "select",
						"options": []
					},
					{
						"name": "variant",
						"type": "select",
						"options": []
					}
				]
			}
		},
		{
			"name": "active",
			"type": "text"
		},
		{
			"name": "items",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "href",
						"type": "text"
					},
					{
						"name": "label",
						"type": "text"
					}
				]
			}
		},
		{
			"name": "logo",
			"type": "object",
			"properties": [
				{
					"name": "alt",
					"type": "text"
				},
				{
					"name": "href",
					"type": "text"
				},
				{
					"name": "imageUrl",
					"type": "text"
				},
				{
					"name": "text",
					"type": "text"
				},
				{
					"name": "type",
					"type": "select",
					"options": []
				}
			]
		}
	]
};
