import type { AiComponentSchema } from "@anvilkit/core/types";

export const blogList: AiComponentSchema = {
	"componentName": "BlogList",
	"description": "",
	"fields": [
		{
			"name": "posts",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "description",
						"type": "text"
					},
					{
						"name": "href",
						"type": "text"
					},
					{
						"name": "imageAlt",
						"type": "text"
					},
					{
						"name": "imageSrc",
						"type": "text"
					},
					{
						"name": "openInNewTab",
						"type": "select",
						"options": []
					},
					{
						"name": "publishedAt",
						"type": "text"
					},
					{
						"name": "publishedLabel",
						"type": "text"
					},
					{
						"name": "relativeLabel",
						"type": "text"
					},
					{
						"name": "title",
						"type": "text"
					}
				]
			}
		}
	]
};
