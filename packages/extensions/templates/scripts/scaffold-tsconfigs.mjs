#!/usr/bin/env node
/**
 * Writes a fresh `tsconfig.json` into every template package.
 *
 * Each file is self-contained (no shared base) because
 * `packages/templates/` is not itself a pnpm workspace member — so
 * `@anvilkit/typescript-config` resolves only from each template's
 * own `node_modules`.
 */

import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const content = {
	$schema: "https://json.schemastore.org/tsconfig",
	extends: "@anvilkit/typescript-config/base.json",
	compilerOptions: {
		outDir: "./dist",
		rootDir: "./src",
		declaration: true,
		declarationMap: true,
		noEmit: false,
		resolveJsonModule: true,
	},
	include: ["src/**/*.ts", "src/**/*.json"],
};

const slugs = readdirSync(root, { withFileTypes: true })
	.filter((d) => d.isDirectory() && d.name !== "scripts")
	.map((d) => d.name);

for (const slug of slugs) {
	writeFileSync(
		join(root, slug, "tsconfig.json"),
		`${JSON.stringify(content, null, "\t")}\n`,
	);
	console.log(`wrote packages/templates/${slug}/tsconfig.json`);
}
