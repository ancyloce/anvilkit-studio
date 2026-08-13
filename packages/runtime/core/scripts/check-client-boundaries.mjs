#!/usr/bin/env node
/**
 * @file Enforce the React client boundaries shipped by public editor
 * surfaces (review 0037 P2-10).
 *
 * RSC tooling recognizes `"use client"` per module, not by observing that
 * a descendant eventually calls a hook. Every component/hook barrel under
 * the public `react/overrides` subpath and every state provider/hook module
 * must therefore carry its own directive. Keeping the rule executable
 * prevents a new override or a refactor from silently losing the boundary.
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, "..");
const REACT_ENTRY = resolve(PACKAGE_ROOT, "src/react/index.ts");
const OVERRIDES_DIR = resolve(PACKAGE_ROOT, "src/react/overrides");
const OVERRIDES_ENTRY = resolve(OVERRIDES_DIR, "index.ts");
const STATE_DIR = resolve(PACKAGE_ROOT, "src/state");
const DIRECTIVE = /^\s*["']use client["'];/;

async function* sourceFiles(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const file = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "__tests__") yield* sourceFiles(file);
			continue;
		}
		if (
			entry.isFile() &&
			(entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
		) {
			yield file;
		}
	}
}

function isOverridesClientSurface(file) {
	const name = basename(file);
	return (
		file === OVERRIDES_ENTRY ||
		(name === "index.ts" && !file.includes(`${join("theme", "index.ts")}`)) ||
		name.startsWith("use-") ||
		name.endsWith(".tsx")
	);
}

function isStateClientSurface(file) {
	const name = basename(file);
	return (
		name === "editor-i18n-context.tsx" ||
		name === "editor-ui-selectors.ts" ||
		name.startsWith("use-") ||
		name.endsWith("Provider.tsx")
	);
}

async function hasDirective(file) {
	const source = await readFile(file, "utf8");
	return DIRECTIVE.test(source);
}

async function main() {
	const missing = [];
	if (!(await hasDirective(REACT_ENTRY))) {
		missing.push(relative(PACKAGE_ROOT, REACT_ENTRY));
	}
	for await (const file of sourceFiles(OVERRIDES_DIR)) {
		if (isOverridesClientSurface(file) && !(await hasDirective(file))) {
			missing.push(relative(PACKAGE_ROOT, file));
		}
	}
	for await (const file of sourceFiles(STATE_DIR)) {
		if (isStateClientSurface(file) && !(await hasDirective(file))) {
			missing.push(relative(PACKAGE_ROOT, file));
		}
	}
	if (missing.length > 0) {
		console.error(
			`Missing \"use client\" in public client surfaces:\n${missing
				.sort()
				.map((file) => `  - ${file}`)
				.join("\n")}`,
		);
		process.exitCode = 1;
		return;
	}
	console.log("Client-boundary check passed.");
}

await main();
