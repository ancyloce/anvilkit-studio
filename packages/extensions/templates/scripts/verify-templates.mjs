#!/usr/bin/env node
/**
 * Loads every built `@anvilkit/template-*` package, checks its
 * default export against the structural contract from
 * `@anvilkit/core/templates`, and reports any failures.
 *
 * Runs against `dist/` — call `pnpm --filter '@anvilkit/template-*'
 * build` first.
 */

import { readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const { isAnvilkitTemplate } = await import(
	pathToFileURL(join(root, "..", "core", "dist", "templates", "index.js")).href
);

// `canvas/` holds @anvilkit/canvas-templates — CanvasIR designs, a
// different IR than the Puck `AnvilkitTemplate` packages checked here.
// It is validated against `CanvasIRSchema` by its own Vitest suite.
const SKIP = new Set(["scripts", "canvas"]);

const slugs = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory() && !SKIP.has(d.name))
	.map((d) => d.name)
	.sort();

let failures = 0;

for (const slug of slugs) {
	const distIndex = join(root, slug, "dist", "index.js");
	if (!existsSync(distIndex)) {
		console.error(`FAIL ${slug}: no dist/index.js — run build first`);
		failures += 1;
		continue;
	}
	const mod = await import(pathToFileURL(distIndex).href);
	const template = mod.default;
	if (!isAnvilkitTemplate(template)) {
		console.error(
			`FAIL ${slug}: default export does not satisfy isAnvilkitTemplate()`,
		);
		console.error(JSON.stringify(template, null, 2).slice(0, 400));
		failures += 1;
		continue;
	}
	if (template.slug !== slug) {
		console.error(
			`FAIL ${slug}: manifest slug "${template.slug}" does not match dir "${slug}"`,
		);
		failures += 1;
		continue;
	}
	const childCount = template.pageIR.root.children?.length ?? 0;
	console.log(
		`ok   ${slug.padEnd(22)} ${childCount} root-level nodes, ${template.packages.length} packages`,
	);
}

if (failures > 0) {
	console.error(`\n${failures} failure(s).`);
	process.exit(1);
}
console.log(`\nAll ${slugs.length} templates pass isAnvilkitTemplate().`);
