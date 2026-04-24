import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-changelog — changelog seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "changelog",
	name: "Changelog",
	description: "Navbar, section heading, and a blog-list re-used as the changelog entry stream.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Changelog template preview",
	},
	packages: [
		{ name: "@anvilkit/blog-list", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/section", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
