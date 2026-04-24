#!/usr/bin/env node
/**
 * Scaffolds `src/index.ts` and `README.md` for every
 * `@anvilkit/template-*` package. Re-running it overwrites the
 * generated files — the manifest fields (name, description, package
 * list, preview alt) live here as the single source of truth.
 *
 * The `page-ir.json` files are NOT touched by this script; they are
 * authored by hand so the committed tree diffs are reviewable.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/**
 * Version pin used in every template's `packages` manifest. Aligned
 * with the current component-package beta (0.0.x). When the fixed
 * group bumps to `1.0.0`, update this string and re-run the
 * scaffolder.
 */
const COMPONENT_PIN = "^0.0.2";

/** @type {Array<{
 *   slug: string;
 *   name: string;
 *   tagline: string;
 *   description: string;
 *   packages: string[];
 * }>} */
const templates = [
	{
		slug: "landing-saas",
		name: "Landing — SaaS",
		tagline: "A conversion-focused SaaS landing page.",
		description:
			"Navbar, hero, logo cloud, bento feature grid, pricing, statistics, and FAQ — the full set for a typical SaaS home page.",
		packages: [
			"bento-grid",
			"helps",
			"hero",
			"logo-clouds",
			"navbar",
			"pricing-minimal",
			"statistics",
		],
	},
	{
		slug: "landing-agency",
		name: "Landing — Agency",
		tagline: "A services-led agency landing page.",
		description:
			"Navbar, hero, about section, services grid, social proof stats, and a CTA button.",
		packages: [
			"bento-grid",
			"button",
			"hero",
			"navbar",
			"section",
			"statistics",
		],
	},
	{
		slug: "landing-docs",
		name: "Landing — Docs / Dev-tool",
		tagline: "Landing page for a developer-tool docs site.",
		description:
			"Navbar, hero, feature section, and FAQ — tuned for a developer audience who want the punchline fast.",
		packages: ["helps", "hero", "navbar", "section"],
	},
	{
		slug: "pricing-comparison",
		name: "Pricing Comparison",
		tagline: "A standalone pricing page.",
		description:
			"Navbar, hero banner, three-tier pricing grid, and a comparison FAQ — drop-in replacement for `/pricing`.",
		packages: ["helps", "hero", "navbar", "pricing-minimal"],
	},
	{
		slug: "blog-index",
		name: "Blog Index",
		tagline: "A blog landing / index page.",
		description:
			"Navbar, section heading, and a paginated post list.",
		packages: ["blog-list", "navbar", "section"],
	},
	{
		slug: "blog-article",
		name: "Blog Article",
		tagline: "A single blog-article page.",
		description:
			"Navbar, article section with rich prose, and a related-posts CTA button at the foot.",
		packages: ["button", "navbar", "section"],
	},
	{
		slug: "feature-overview",
		name: "Feature Overview",
		tagline: "Product feature overview page.",
		description:
			"Navbar, hero, bento feature grid, statistics, and FAQ — suited to the `/features` subpage of a product site.",
		packages: [
			"bento-grid",
			"helps",
			"hero",
			"navbar",
			"statistics",
		],
	},
	{
		slug: "contact",
		name: "Contact",
		tagline: "A contact-us page.",
		description:
			"Navbar, section with copy, inline email + message inputs, and a submit button. No form handler wired — users hook up their own.",
		packages: ["button", "input", "navbar", "section"],
	},
	{
		slug: "about",
		name: "About",
		tagline: "An about / mission page.",
		description:
			"Navbar, hero, mission section, statistics, and a customer logo cloud.",
		packages: [
			"hero",
			"logo-clouds",
			"navbar",
			"section",
			"statistics",
		],
	},
	{
		slug: "changelog",
		name: "Changelog",
		tagline: "A product changelog page.",
		description:
			"Navbar, section heading, and a blog-list re-used as the changelog entry stream.",
		packages: ["blog-list", "navbar", "section"],
	},
];

const indexSource = ({ slug, name, description, packages }) => `import type { AnvilkitTemplate } from "@anvilkit/core/templates";
import pageIR from "./page-ir.json" with { type: "json" };

/**
 * @anvilkit/template-${slug} — ${name.toLowerCase()} seed template
 * (phase5-017).
 *
 * The manifest shape here is the single source of truth; the IR
 * itself is authored in \`page-ir.json\` so reviewers can diff it
 * directly.
 */
const template: AnvilkitTemplate = {
	slug: "${slug}",
	name: "${name.replace(/"/g, '\\"')}",
	description: ${JSON.stringify(description)},
	preview: {
		src: "./preview.png",
		width: 1200,
		height: 675,
		alt: "${name.replace(/"/g, '\\"')} template preview",
	},
	packages: [
${packages
	.map(
		(p) =>
			`\t\t{ name: "@anvilkit/${p}", version: "${COMPONENT_PIN}" },`,
	)
	.join("\n")}
	],
	pageIR: pageIR as AnvilkitTemplate["pageIR"],
};

export default template;
`;

const readmeSource = ({ slug, name, tagline, description, packages }) => `# @anvilkit/template-${slug}

${tagline}

${description}

![${name} preview](./preview.png)

## Install

\`\`\`sh
npx anvilkit init --template ${slug} my-site
\`\`\`

## Composition

This template composes the following component packages:

${packages.map((p) => `- \`@anvilkit/${p}\``).join("\n")}

## Editing

The canonical \`PageIR\` tree is committed at \`src/page-ir.json\`. The
package's default export bundles that IR with the manifest fields
(slug, name, description, preview, package list) into an
\`AnvilkitTemplate\`.

See \`docs/decisions/003-core-templates-subpath.md\` for the
\`AnvilkitTemplate\` contract.
`;

for (const t of templates) {
	const dir = join(root, t.slug);
	writeFileSync(join(dir, "src", "index.ts"), indexSource(t));
	writeFileSync(join(dir, "README.md"), readmeSource(t));
	console.log(`wrote packages/templates/${t.slug}/{src/index.ts, README.md}`);
}
