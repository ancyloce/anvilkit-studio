import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-landing-saas — landing — saas seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in `page-ir.json` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "landing-saas",
	name: "Landing — SaaS",
	description: "Navbar, hero, logo cloud, bento feature grid, pricing, statistics, and FAQ — the full set for a typical SaaS home page.",
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "Landing — SaaS template preview",
	},
	packages: [
		{ name: "@anvilkit/bento-grid", version: "^0.0.2" },
		{ name: "@anvilkit/helps", version: "^0.0.2" },
		{ name: "@anvilkit/hero", version: "^0.0.2" },
		{ name: "@anvilkit/logo-clouds", version: "^0.0.2" },
		{ name: "@anvilkit/navbar", version: "^0.0.2" },
		{ name: "@anvilkit/pricing-minimal", version: "^0.0.2" },
		{ name: "@anvilkit/statistics", version: "^0.0.2" },
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
