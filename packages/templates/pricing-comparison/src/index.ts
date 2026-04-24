import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-pricing-comparison — pricing comparison seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "pricing-comparison",
	name: "Pricing Comparison",
	description: "Navbar, hero banner, three-tier pricing grid, and a comparison FAQ — drop-in replacement for `/pricing`.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Pricing Comparison template preview",
	},
	packages: [
		{ name: "@anvilkit/helps", version: "^0.0.2" },
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/pricing-minimal", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
