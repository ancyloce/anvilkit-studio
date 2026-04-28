#!/usr/bin/env node
/**
 * Reads every `@anvilkit/template-*` package and emits its Starlight
 * MDX page under `src/content/docs/templates/<slug>.mdx`. Also copies
 * each template's `preview.png` into `public/templates/` so Starlight
 * serves them at `/templates/<slug>/preview.png`.
 *
 * Re-runnable; overwrites its own output on every run. Wired into
 * `apps/docs` via the `prebuild` script.
 *
 * phase5-018.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(here, "..");
const WORKSPACE_ROOT = join(DOCS_ROOT, "..", "..");
const TEMPLATES_ROOT = join(WORKSPACE_ROOT, "packages", "templates");
const MDX_OUT = join(DOCS_ROOT, "src", "content", "docs", "templates");
const PREVIEW_OUT = join(DOCS_ROOT, "public", "templates");

/**
 * Reads the default export of a template package's built dist bundle.
 * Falls back to page-ir.json + package.json inference when dist is
 * missing so generation does not block a fresh clone.
 */
function readManifest(slug) {
	const pkg = JSON.parse(
		readFileSync(join(TEMPLATES_ROOT, slug, "package.json"), "utf8"),
	);
	let readme = "";
	const readmePath = join(TEMPLATES_ROOT, slug, "README.md");
	if (existsSync(readmePath)) {
		readme = readFileSync(readmePath, "utf8");
	}
	let pageIR = null;
	const irPath = join(TEMPLATES_ROOT, slug, "src", "page-ir.json");
	if (existsSync(irPath)) {
		pageIR = JSON.parse(readFileSync(irPath, "utf8"));
	}
	return { pkg, readme, pageIR };
}

function mdxForTemplate({ slug, pkg, readme, pageIR }) {
	const displayName = pkg.description.split("—")[0]?.trim() || slug;
	const description = pkg.description;
	// Extract component types from the committed IR so the catalog
	// page shows the true composition without re-deriving it from
	// `packages`.
	const nodeTypes = (pageIR?.root?.children ?? [])
		.map((n) => n.type)
		.filter((t, i, a) => a.indexOf(t) === i);

	const readmeBody = readme
		// Drop the top-level H1 — the frontmatter `title` becomes the
		// page heading instead.
		.replace(/^#\s.*\n+/m, "")
		// Strip the README's `![preview](./preview.png)` line; the MDX
		// template renders the preview at the top from the absolute
		// `/templates/<slug>/preview.png` path instead.
		.replace(/!\[[^\]]*\]\(\.\/preview\.png\)\n*/g, "")
		.trim();

	return `---
title: "${displayName}"
description: ${JSON.stringify(description)}
sidebar:
  label: "${displayName}"
editUrl: false
---

![${displayName} preview](/templates/${slug}/preview.png)

<div class="anvilkit-template-meta">
\t<code>${pkg.name}</code> <span>·</span> <span>v${pkg.version}</span>
</div>

## Scaffold from the CLI

\`\`\`sh
npx anvilkit init --template ${slug} my-site
\`\`\`

## Composition

The committed \`PageIR\` wires the following node types at the root:

${nodeTypes.map((t) => `- \`${t}\``).join("\n")}

## Package details

${readmeBody}
`;
}

function indexMdx(templates) {
	return `---
title: Templates
description: "Browse the 10 first-party Anvilkit seed templates — landing pages, blog layouts, pricing, contact, and about. Scaffold any of them with \`npx anvilkit init --template <slug>\`."
sidebar:
  label: Templates
---

import { Card, CardGrid } from "@astrojs/starlight/components";

# Templates

Ten first-party seed templates ship with Anvilkit 1.0. Each composes
real \`@anvilkit/*\` component packages — zero placeholders, zero
fake data — and scaffolds into a running Puck project with one CLI
call:

\`\`\`sh
npx anvilkit init --template <slug> my-site
\`\`\`

<CardGrid>
${templates
	.map(
		({ slug, displayName, description }) =>
			`\t<Card title={${JSON.stringify(displayName)}} icon="document">\n\t\t<a href="/templates/${slug}/">${displayName}</a>\n\n\t\t${description}\n\n\t\t<img src="/templates/${slug}/preview.png" alt="${displayName} preview" loading="lazy" style="width:100%;height:auto;border-radius:.5rem;margin-top:.75rem" />\n\t</Card>`,
	)
	.join("\n")}
</CardGrid>

## What's in each template

Every template package exports a default \`AnvilkitTemplate\`
(see [ADR 003](../decisions/003-core-templates-subpath/)) containing:

- \`slug\` / \`name\` / \`description\` — shown in this catalog and
  in the CLI picker.
- \`preview\` — static 1200×675 thumbnail.
- \`packages\` — the exact list of \`@anvilkit/*\` component
  packages the template pulls in. The CLI installs only these, not
  the full component catalog.
- \`pageIR\` — the committed \`PageIR\` tree, reviewable as plain
  JSON at \`packages/templates/<slug>/src/page-ir.json\`.
`;
}

function main() {
	if (existsSync(MDX_OUT)) {
		rmSync(MDX_OUT, { recursive: true, force: true });
	}
	mkdirSync(MDX_OUT, { recursive: true });
	mkdirSync(PREVIEW_OUT, { recursive: true });

	const slugs = readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
		.filter(
			(d) =>
				d.isDirectory() &&
				!d.name.startsWith(".") &&
				d.name !== "scripts" &&
				d.name !== "node_modules",
		)
		.map((d) => d.name)
		.sort();

	const templates = [];

	for (const slug of slugs) {
		const { pkg, readme, pageIR } = readManifest(slug);
		const displayName = pkg.description.split("—")[0]?.trim() || slug;
		templates.push({ slug, displayName, description: pkg.description });

		writeFileSync(
			join(MDX_OUT, `${slug}.mdx`),
			mdxForTemplate({ slug, pkg, readme, pageIR }),
		);

		const previewSrc = join(TEMPLATES_ROOT, slug, "preview.png");
		if (existsSync(previewSrc)) {
			mkdirSync(join(PREVIEW_OUT, slug), { recursive: true });
			copyFileSync(previewSrc, join(PREVIEW_OUT, slug, "preview.png"));
		}

		console.log(`wrote templates/${slug}.mdx`);
	}

	writeFileSync(join(MDX_OUT, "index.mdx"), indexMdx(templates));
	console.log(`wrote templates/index.mdx (catalog of ${templates.length})`);
}

main();
