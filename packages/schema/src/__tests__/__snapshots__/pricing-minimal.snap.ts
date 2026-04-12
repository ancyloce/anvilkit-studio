import type { AiComponentSchema } from "@anvilkit/core/types";

export const pricingMinimal: AiComponentSchema = {
	componentName: "PricingMinimal",
	description: "",
	fields: [
		{
			name: "description",
			type: "text",
		},
		{
			name: "headline",
			type: "text",
		},
		{
			name: "plans",
			type: "array",
			itemSchema: {
				name: "item",
				type: "object",
				description:
					"Object with fields: name, description, price, billingPeriodLabel, ctaLabel, ctaHref, ctaOpenInNewTab, featured, badgeLabel, features, extraFeatures",
			},
		},
	],
};
