import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-blog-article — blog article seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "blog-article",
	name: "Blog Article",
	description: "Navbar, article section with rich prose, and a related-posts CTA button at the foot.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Blog Article template preview",
	},
	packages: [
		{ name: "@anvilkit/button", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/section", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
