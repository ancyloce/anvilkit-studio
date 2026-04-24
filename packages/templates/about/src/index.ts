import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-about — about seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "about",
	name: "About",
	description: "Navbar, hero, mission section, statistics, and a customer logo cloud.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "About template preview",
	},
	packages: [
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/logo-clouds", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/section", version: "^0.0.2" },
		{ name: "@anvilkit/statistics", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
