/**
 * Self-contained Puck `Data` + `Config` fixtures for the 9 demo
 * components. Each fixture mirrors the happy-path defaultProps from
 * the corresponding `@anvilkit/<slug>` package **without** importing
 * it (the IR package has zero component-package dependencies).
 *
 * These fixtures drive the round-trip, canonical-form, and snapshot
 * tests.
 */
import type { Config, Data } from "@puckeditor/core";

// ---------------------------------------------------------------------------
// Helpers — minimal render stubs so Config satisfies the type contract.
// They are never called; the IR transform only reads fields / metadata.
// ---------------------------------------------------------------------------
const noop = (() => null) as unknown as Config["components"][string]["render"];

// ---------------------------------------------------------------------------
// 1. Hero
// ---------------------------------------------------------------------------
export const heroData: Data = {
	root: {},
	content: [
		{
			type: "Hero",
			props: {
				id: "hero-1",
				announcementHref: "",
				announcementLabel: "We raised $69M pre seed",
				announcementOpenInNewTab: false,
				description:
					"Our state of the art tool is a tool that allows you to\nwrite copy instantly.",
				headline: "Write fast with\naccurate precision.",
				linuxHref: "/download/linux",
				linuxLabel: "Download for Linux",
				linuxOpenInNewTab: false,
				windowsHref: "/download/windows",
				windowsLabel: "Download for Windows",
				windowsOpenInNewTab: false,
			},
		},
	],
};

export const heroConfig: Config = {
	components: {
		Hero: {
			render: noop,
			fields: {
				announcementLabel: { type: "text" },
				announcementHref: { type: "text" },
				announcementOpenInNewTab: {
					type: "radio",
					options: [
						{ label: "No", value: false },
						{ label: "Yes", value: true },
					],
				},
				headline: { type: "textarea" },
				description: { type: "textarea" },
				linuxLabel: { type: "text" },
				linuxHref: { type: "text" },
				linuxOpenInNewTab: {
					type: "radio",
					options: [
						{ label: "No", value: false },
						{ label: "Yes", value: true },
					],
				},
				windowsLabel: { type: "text" },
				windowsHref: { type: "text" },
				windowsOpenInNewTab: {
					type: "radio",
					options: [
						{ label: "No", value: false },
						{ label: "Yes", value: true },
					],
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 2. Section
// ---------------------------------------------------------------------------
export const sectionData: Data = {
	root: {},
	content: [
		{
			type: "Section",
			props: {
				id: "section-1",
				badgeLabel: "Scale",
				description:
					"Your AI agent handles repetitive coding tasks, reviews every commit, and catches bugs before deployment. Spend time on architecture, not syntax.",
				headline: "Stop writing boilerplate.",
				highlightedHeadline: "Start building features.",
			},
		},
	],
};

export const sectionConfig: Config = {
	components: {
		Section: {
			render: noop,
			fields: {
				badgeLabel: { type: "text" },
				headline: { type: "text" },
				highlightedHeadline: { type: "text" },
				description: { type: "textarea" },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 3. BentoGrid
// ---------------------------------------------------------------------------
export const bentoGridData: Data = {
	root: {},
	content: [
		{
			type: "BentoGrid",
			props: {
				id: "bento-grid-1",
				items: [
					{
						icon: "brain",
						title: "Simple Agent Workflows",
						description:
							"Easily create and manage AI agent workflows with intuitive APIs.",
						ctaHref: "#",
					},
					{
						icon: "users",
						title: "Multi-Agent Systems",
						description:
							"Build complex systems with multiple AI agents working together.",
						ctaHref: "#",
					},
					{
						icon: "plug",
						title: "Tool Integration",
						description:
							"Seamlessly integrate external tools and APIs into your agent workflows.",
						ctaHref: "#",
					},
					{
						icon: "globe",
						title: "Cross-Language Support",
						description:
							"Available in all major programming languages for maximum flexibility.",
						ctaHref: "#",
					},
					{
						icon: "code",
						title: "Customizable Agents",
						description:
							"Design and customize agents to fit your specific use case and requirements.",
						ctaHref: "#",
					},
					{
						icon: "zap",
						title: "Efficient Execution",
						description:
							"Optimize agent performance with built-in efficiency and scalability features.",
						ctaHref: "#",
					},
				],
				platform: "adaptive",
				theme: "dark",
			},
		},
	],
};

export const bentoGridConfig: Config = {
	components: {
		BentoGrid: {
			render: noop,
			fields: {
				theme: {
					type: "select",
					options: [
						{ label: "System", value: "system" },
						{ label: "Light", value: "light" },
						{ label: "Dark", value: "dark" },
					],
				},
				platform: {
					type: "select",
					options: [
						{ label: "Adaptive", value: "adaptive" },
						{ label: "Mobile", value: "mobile" },
						{ label: "Tablet", value: "tablet" },
						{ label: "Desktop", value: "desktop" },
					],
				},
				items: {
					type: "array",
					arrayFields: {
						icon: { type: "select", options: [] },
						title: { type: "text" },
						description: { type: "textarea" },
						size: { type: "select", options: [] },
						rounded: { type: "radio", options: [] },
						background: { type: "radio", options: [] },
						ctaLabel: { type: "text" },
						ctaHref: { type: "text" },
						ctaOpenInNewTab: { type: "radio", options: [] },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 4. Helps
// ---------------------------------------------------------------------------
export const helpsData: Data = {
	root: {},
	content: [
		{
			type: "Helps",
			props: {
				id: "helps-1",
				avatars: [
					{
						name: "Alice Johnson",
						imageUrl:
							"https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
						initials: "AJ",
					},
					{
						name: "Bob Brown",
						imageUrl:
							"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
						initials: "BB",
					},
					{
						name: "Charlie Davis",
						imageUrl:
							"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
						initials: "CD",
					},
					{
						name: "Diana Evans",
						imageUrl:
							"https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
						initials: "DE",
					},
					{
						name: "Ethan Ford",
						imageUrl:
							"https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
						initials: "EF",
					},
				],
				buttonHref: "/contribute",
				buttonLabel: "Become a contributor",
				buttonOpenInNewTab: false,
				message:
					"We're grateful for the amazing open-source community\nthat helps make our project better every day.",
			},
		},
	],
};

export const helpsConfig: Config = {
	components: {
		Helps: {
			render: noop,
			fields: {
				message: { type: "textarea" },
				buttonLabel: { type: "text" },
				buttonHref: { type: "text" },
				buttonOpenInNewTab: {
					type: "radio",
					options: [
						{ label: "No", value: false },
						{ label: "Yes", value: true },
					],
				},
				avatars: {
					type: "array",
					arrayFields: {
						name: { type: "text" },
						imageUrl: { type: "text" },
						initials: { type: "text" },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 5. Navbar
// ---------------------------------------------------------------------------
export const navbarData: Data = {
	root: {},
	content: [
		{
			type: "Navbar",
			props: {
				id: "navbar-1",
				actions: [
					{
						disabled: false,
						href: "/signup",
						label: "Sign up",
						openInNewTab: false,
						size: "lg",
						variant: "secondary",
					},
				],
				active: "/features",
				items: [
					{ href: "/overview", label: "Overview" },
					{ href: "/features", label: "Features" },
					{ href: "/integrations", label: "Integrations" },
					{ href: "/customers", label: "Customers" },
					{ href: "/changelog", label: "Changelog" },
				],
				logo: {
					alt: "Underline",
					href: "/",
					imageUrl: "",
					text: "Underline",
					type: "text",
				},
			},
		},
	],
};

export const navbarConfig: Config = {
	components: {
		Navbar: {
			render: noop,
			fields: {
				logo: {
					type: "object",
					objectFields: {
						type: { type: "radio", options: [] },
						text: { type: "text" },
						imageUrl: { type: "text" },
						alt: { type: "text" },
						href: { type: "text" },
					},
				},
				items: {
					type: "array",
					arrayFields: {
						label: { type: "text" },
						href: { type: "text" },
					},
				},
				actions: {
					type: "array",
					arrayFields: {
						label: { type: "text" },
						href: { type: "text" },
						variant: { type: "select", options: [] },
						size: { type: "select", options: [] },
						openInNewTab: { type: "radio", options: [] },
						disabled: { type: "radio", options: [] },
					},
				},
				active: { type: "text" },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 6. LogoClouds
// ---------------------------------------------------------------------------
export const logoCloudsData: Data = {
	root: {},
	content: [
		{
			type: "LogoClouds",
			props: {
				id: "logo-clouds-1",
				subtitle:
					"Trusted by the teams building polished, high-performance products for the modern web.",
				title: "Brands love us",
			},
		},
	],
};

export const logoCloudsConfig: Config = {
	components: {
		LogoClouds: {
			render: noop,
			fields: {
				title: { type: "text" },
				subtitle: { type: "textarea" },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 7. Statistics
// ---------------------------------------------------------------------------
export const statisticsData: Data = {
	root: {},
	content: [
		{
			type: "Statistics",
			props: {
				id: "statistics-1",
				title: "Statistics",
			},
		},
	],
};

export const statisticsConfig: Config = {
	components: {
		Statistics: {
			render: noop,
			fields: {
				title: { type: "text" },
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 8. PricingMinimal
// ---------------------------------------------------------------------------
export const pricingMinimalData: Data = {
	root: {},
	content: [
		{
			type: "PricingMinimal",
			props: {
				id: "pricing-minimal-1",
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
							{ label: "5 Projects" },
							{ label: "10GB Storage" },
							{ label: "Basic Analytics" },
							{ label: "Email Support" },
							{ label: "API Access" },
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
							{ label: "Custom Integrations" },
							{ label: "Team Collaboration" },
							{ label: "Advanced Security" },
						],
						featured: true,
						features: [
							{ label: "Unlimited Projects" },
							{ label: "100GB Storage" },
							{ label: "Advanced Analytics" },
							{ label: "Priority Support" },
							{ label: "API Access" },
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
							{ label: "SSO & SAML" },
							{ label: "Audit Logs" },
							{ label: "SLA Guarantee" },
						],
						featured: false,
						features: [
							{ label: "Unlimited Projects" },
							{ label: "Unlimited Storage" },
							{ label: "Custom Analytics" },
							{ label: "24/7 Phone Support" },
							{ label: "Dedicated Account Manager" },
						],
						name: "Business",
						price: "$99",
					},
				],
			},
		},
	],
};

export const pricingMinimalConfig: Config = {
	components: {
		PricingMinimal: {
			render: noop,
			fields: {
				headline: { type: "text" },
				description: { type: "textarea" },
				plans: {
					type: "array",
					arrayFields: {
						name: { type: "text" },
						description: { type: "textarea" },
						price: { type: "text" },
						billingPeriodLabel: { type: "text" },
						ctaLabel: { type: "text" },
						ctaHref: { type: "text" },
						ctaOpenInNewTab: { type: "radio", options: [] },
						featured: { type: "radio", options: [] },
						badgeLabel: { type: "text" },
						features: {
							type: "array",
							arrayFields: { label: { type: "text" } },
						},
						extraFeatures: {
							type: "array",
							arrayFields: { label: { type: "text" } },
						},
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// 9. BlogList
// ---------------------------------------------------------------------------
const defaultPreviewImageSrc =
	"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80";

export const blogListData: Data = {
	root: {},
	content: [
		{
			type: "BlogList",
			props: {
				id: "blog-list-1",
				posts: [
					{
						description:
							"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
						href: "/blog/how-dev-ai",
						imageAlt: "How Dev AI?",
						imageSrc: defaultPreviewImageSrc,
						openInNewTab: false,
						publishedAt: "2024-11-01",
						publishedLabel: "November 1, 2024",
						relativeLabel: "8mo ago",
						title: "How Dev AI?",
					},
					{
						description:
							"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
						href: "/blog/why-dev-ai",
						imageAlt: "Why Dev AI?",
						imageSrc: defaultPreviewImageSrc,
						openInNewTab: false,
						publishedAt: "2024-11-01",
						publishedLabel: "November 1, 2024",
						relativeLabel: "8mo ago",
						title: "Why Dev AI?",
					},
					{
						description:
							"Introducing Acme.ai, a cutting-edge AI solution for modern businesses.",
						href: "/blog/introducing-dev-ai",
						imageAlt: "Introducing Acme.ai",
						imageSrc: defaultPreviewImageSrc,
						openInNewTab: false,
						publishedAt: "2024-08-29",
						publishedLabel: "August 29, 2024",
						relativeLabel: "10mo ago",
						title: "Introducing Acme.ai",
					},
				],
			},
		},
	],
};

export const blogListConfig: Config = {
	components: {
		BlogList: {
			render: noop,
			fields: {
				posts: {
					type: "array",
					arrayFields: {
						title: { type: "text" },
						description: { type: "textarea" },
						href: { type: "text" },
						openInNewTab: { type: "radio", options: [] },
						imageSrc: { type: "text" },
						imageAlt: { type: "text" },
						publishedAt: { type: "text" },
						publishedLabel: { type: "text" },
						relativeLabel: { type: "text" },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Aggregate export — for tests that iterate over all 9 fixtures.
// ---------------------------------------------------------------------------
export interface DemoFixture {
	readonly name: string;
	readonly data: Data;
	readonly config: Config;
}

export const allDemoFixtures: readonly DemoFixture[] = [
	{ name: "Hero", data: heroData, config: heroConfig },
	{ name: "Section", data: sectionData, config: sectionConfig },
	{ name: "BentoGrid", data: bentoGridData, config: bentoGridConfig },
	{ name: "Helps", data: helpsData, config: helpsConfig },
	{ name: "Navbar", data: navbarData, config: navbarConfig },
	{ name: "LogoClouds", data: logoCloudsData, config: logoCloudsConfig },
	{ name: "Statistics", data: statisticsData, config: statisticsConfig },
	{
		name: "PricingMinimal",
		data: pricingMinimalData,
		config: pricingMinimalConfig,
	},
	{ name: "BlogList", data: blogListData, config: blogListConfig },
];
