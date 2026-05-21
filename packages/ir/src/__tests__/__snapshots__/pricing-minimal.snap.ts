import type { PageIR } from "@anvilkit/core/types";

export const pricingMinimal: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
		children: [
			{
				id: "pricing-minimal-1",
				type: "PricingMinimal",
				props: {
					description:
						"Choose a plan that works best for you and your team. No hidden fees.",
					headline: "Simple, Transparent Pricing",
					plans: [
						{
							badgeLabel: "",
							billingPeriodLabel: "per month",
							ctaHref: "/signup/basic",
							ctaLabel: "Get Started",
							ctaOpenInNewTab: false,
							description: "Perfect for side projects and small teams",
							extraFeatures: [],
							featured: false,
							features: [
								{
									label: "5 Projects",
								},
								{
									label: "10GB Storage",
								},
								{
									label: "Basic Analytics",
								},
								{
									label: "Email Support",
								},
								{
									label: "API Access",
								},
							],
							name: "Basic",
							price: "$9",
						},
						{
							badgeLabel: "Popular",
							billingPeriodLabel: "per month",
							ctaHref: "/signup/pro",
							ctaLabel: "Get Started",
							ctaOpenInNewTab: false,
							description: "For growing teams that need more power",
							extraFeatures: [
								{
									label: "Custom Integrations",
								},
								{
									label: "Team Collaboration",
								},
								{
									label: "Advanced Security",
								},
							],
							featured: true,
							features: [
								{
									label: "Unlimited Projects",
								},
								{
									label: "100GB Storage",
								},
								{
									label: "Advanced Analytics",
								},
								{
									label: "Priority Support",
								},
								{
									label: "API Access",
								},
							],
							name: "Pro",
							price: "$29",
						},
						{
							badgeLabel: "",
							billingPeriodLabel: "per month",
							ctaHref: "/signup/business",
							ctaLabel: "Get Started",
							ctaOpenInNewTab: false,
							description: "For organizations that need full control",
							extraFeatures: [
								{
									label: "SSO & SAML",
								},
								{
									label: "Audit Logs",
								},
								{
									label: "SLA Guarantee",
								},
							],
							featured: false,
							features: [
								{
									label: "Unlimited Projects",
								},
								{
									label: "Unlimited Storage",
								},
								{
									label: "Custom Analytics",
								},
								{
									label: "24/7 Phone Support",
								},
								{
									label: "Dedicated Account Manager",
								},
							],
							name: "Business",
							price: "$99",
						},
					],
				},
			},
		],
	},
	assets: [],
	metadata: {
		createdAt: "2026-04-11T00:00:00.000Z",
	},
};
