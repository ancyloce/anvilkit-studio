import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-landing-agency — landing — agency seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "landing-agency",
	name: "Landing — Agency",
	description: "Navbar, hero, about section, services grid, social proof stats, and a CTA button.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Landing — Agency template preview",
	},
	packages: [
		{ name: "@anvilkit/bento-grid", version: "^0.0.2" },
		{ name: "@anvilkit/button", version: "^0.0.2" },
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/section", version: "^0.0.2" },
		{ name: "@anvilkit/statistics", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
