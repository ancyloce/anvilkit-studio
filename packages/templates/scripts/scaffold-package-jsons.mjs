#!/usr/bin/env node
/**
 * One-shot scaffolder for the 10 `@anvilkit/template-*` package.json
 * files (task `phase5-017`). Re-running it overwrites every generated
 * package.json with the canonical shape — safe, idempotent, and the
 * single source of truth for their metadata.
 *
 * Run with: `node scripts/scaffold-package-jsons.mjs` from this
 * directory (`packages/templates/`).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const templates = [
	{
		slug: "landing-saas",
		description: "Landing page for a SaaS product — hero, logo cloud, bento features, pricing, FAQ.",
	},
	{
		slug: "landing-agency",
		description: "Landing page for an agency — hero, services bento, statistics, testimonial section.",
	},
	{
		slug: "landing-docs",
		description: "Landing page for a developer-tool documentation site — hero, feature grid, FAQ.",
	},
	{
		slug: "pricing-comparison",
		description: "Standalone pricing page — hero banner, pricing tiers, comparison FAQ.",
	},
	{
		slug: "blog-index",
		description: "Blog index page — navbar, section heading, post list.",
	},
	{
		slug: "blog-article",
		description: "Blog article page — navbar, article section, related-posts CTA.",
	},
	{
		slug: "feature-overview",
		description: "Product feature overview — hero, bento feature grid, statistics, FAQ.",
	},
	{
		slug: "contact",
		description: "Contact page — navbar, contact section, inline email + message form with submit button.",
	},
	{
		slug: "about",
		description: "About page — hero, mission section, statistics, customer logo cloud.",
	},
	{
		slug: "changelog",
		description: "Changelog page — navbar, section heading, blog-list for entries.",
	},
];

for (const { slug, description } of templates) {
	const pkg = {
		name: `@anvilkit/template-${slug}`,
		version: "0.1.0-alpha.0",
		description,
		type: "module",
		main: "./dist/index.js",
		types: "./dist/index.d.ts",
		exports: {
			".": {
				types: "./dist/index.d.ts",
				default: "./dist/index.js",
			},
			"./page-ir.json": "./src/page-ir.json",
			"./preview.png": "./preview.png",
		},
		files: ["dist", "src/page-ir.json", "preview.png", "README.md"],
		license: "MIT",
		sideEffects: false,
		publishConfig: {
			access: "public",
		},
		peerDependencies: {
			"@anvilkit/core": "workspace:*",
		},
		devDependencies: {
			"@anvilkit/core": "workspace:*",
			"@anvilkit/typescript-config": "workspace:*",
			typescript: "6.0.2",
		},
		scripts: {
			build: "tsc",
			typecheck: "tsc --noEmit",
			clean: "rm -rf dist",
		},
	};
	writeFileSync(
		join(root, slug, "package.json"),
		`${JSON.stringify(pkg, null, "\t")}\n`,
	);
	console.log(`wrote packages/templates/${slug}/package.json`);
}
