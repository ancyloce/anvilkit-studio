import type { AiComponentSchema } from "@anvilkit/core/types";

export const pricingMinimal: AiComponentSchema = {
	"componentName": "PricingMinimal",
	"description": "",
	"fields": [
		{
			"name": "description",
			"type": "text"
		},
		{
			"name": "headline",
			"type": "text"
		},
		{
			"name": "plans",
			"type": "array",
			"itemSchema": {
				"name": "item",
				"type": "object",
				"properties": [
					{
						"name": "badgeLabel",
						"type": "text"
					},
					{
						"name": "billingPeriodLabel",
						"type": "text"
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
						"name": "extraFeatures",
						"type": "array",
						"itemSchema": {
							"name": "label",
							"type": "text"
						}
					},
					{
						"name": "featured",
						"type": "select",
						"options": []
					},
					{
						"name": "features",
						"type": "array",
						"itemSchema": {
							"name": "label",
							"type": "text"
						}
					},
					{
						"name": "name",
						"type": "text"
					},
					{
						"name": "price",
						"type": "text"
					}
				]
			}
		}
	]
};
