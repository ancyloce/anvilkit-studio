import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-landing-docs — landing — docs / dev-tool seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "landing-docs",
	name: "Landing — Docs / Dev-tool",
	description: "Navbar, hero, feature section, and FAQ — tuned for a developer audience who want the punchline fast.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Landing — Docs / Dev-tool template preview",
	},
	packages: [
		{ name: "@anvilkit/helps", version: "^0.0.2" },
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/section", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
