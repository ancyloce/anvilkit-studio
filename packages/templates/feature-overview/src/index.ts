import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-feature-overview — feature overview seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "feature-overview",
	name: "Feature Overview",
	description: "Navbar, hero, bento feature grid, statistics, and FAQ — suited to the `/features` subpage of a product site.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Feature Overview template preview",
	},
	packages: [
		{ name: "@anvilkit/bento-grid", version: "^0.0.2" },
		{ name: "@anvilkit/helps", version: "^0.0.2" },
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/statistics", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
