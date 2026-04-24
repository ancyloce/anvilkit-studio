#!/usr/bin/env node
/**
 * Authors the `src/page-ir.json` file for every template from a
 * declarative per-template composition table. Re-running the script
 * overwrites every page-ir.json.
 *
 * Each entry's `nodes` array is the `root.children` list. Node props
 * are deliberately minimal — each component package ships realistic
 * `defaultProps` that fill in when a prop is omitted, so these IRs
 * stay focused on structure (which components are wired where)
 * rather than content (which gets customized per user anyway).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const defs = [
	{
		slug: "landing-saas",
		title: "Landing — SaaS",
		description:
			"Navbar, hero, logo cloud, bento feature grid, pricing, statistics, and FAQ.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["LogoClouds", "logos-1"],
			["BentoGrid", "bento-1"],
			["Statistics", "stats-1"],
			["PricingMinimal", "pricing-1"],
			["Helps", "helps-1"],
		],
	},
	{
		slug: "landing-agency",
		title: "Landing — Agency",
		description:
			"Navbar, hero, about section, services bento, statistics, and CTA button.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["Section", "about-1"],
			["BentoGrid", "services-1"],
			["Statistics", "stats-1"],
			["Button", "cta-1", { label: "Start a project", href: "/contact" }],
		],
	},
	{
		slug: "landing-docs",
		title: "Landing — Docs / Dev-tool",
		description: "Navbar, hero, feature section, and FAQ.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["Section", "features-1"],
			["Helps", "faq-1"],
		],
	},
	{
		slug: "pricing-comparison",
		title: "Pricing Comparison",
		description: "Navbar, hero banner, pricing tiers, and comparison FAQ.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["PricingMinimal", "pricing-1"],
			["Helps", "faq-1"],
		],
	},
	{
		slug: "blog-index",
		title: "Blog Index",
		description: "Navbar, section heading, and blog-list.",
		nodes: [
			["Navbar", "navbar-1"],
			["Section", "heading-1"],
			["BlogList", "posts-1"],
		],
	},
	{
		slug: "blog-article",
		title: "Blog Article",
		description:
			"Navbar, article section, and a related-posts CTA button.",
		nodes: [
			["Navbar", "navbar-1"],
			["Section", "article-1"],
			[
				"Button",
				"related-cta-1",
				{ label: "Read more", href: "/blog" },
			],
		],
	},
	{
		slug: "feature-overview",
		title: "Feature Overview",
		description:
			"Navbar, hero, bento feature grid, statistics, and FAQ.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["BentoGrid", "features-1"],
			["Statistics", "stats-1"],
			["Helps", "faq-1"],
		],
	},
	{
		slug: "contact",
		title: "Contact",
		description:
			"Navbar, copy section, email + message inputs, and submit button.",
		nodes: [
			["Navbar", "navbar-1"],
			["Section", "intro-1"],
			[
				"Input",
				"email-1",
				{ label: "Email", placeholder: "you@example.com", type: "email" },
			],
			[
				"Input",
				"message-1",
				{ label: "Message", placeholder: "How can we help?", type: "text" },
			],
			["Button", "submit-1", { label: "Send", href: "#" }],
		],
	},
	{
		slug: "about",
		title: "About",
		description:
			"Navbar, hero, mission section, statistics, and customer logo cloud.",
		nodes: [
			["Navbar", "navbar-1"],
			["Hero", "hero-1"],
			["Section", "mission-1"],
			["Statistics", "stats-1"],
			["LogoClouds", "customers-1"],
		],
	},
	{
		slug: "changelog",
		title: "Changelog",
		description:
			"Navbar, section heading, and blog-list repurposed as the entry stream.",
		nodes: [
			["Navbar", "navbar-1"],
			["Section", "heading-1"],
			["BlogList", "entries-1"],
		],
	},
];

for (const def of defs) {
	const children = def.nodes.map(([type, id, props]) => ({
		id,
		type,
		props: props ?? {},
	}));
	const pageIR = {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children,
		},
		assets: [],
		metadata: {
			title: def.title,
			description: def.description,
		},
	};
	writeFileSync(
		join(root, def.slug, "src", "page-ir.json"),
		`${JSON.stringify(pageIR, null, "\t")}\n`,
	);
	console.log(`wrote packages/templates/${def.slug}/src/page-ir.json`);
}
