#!/usr/bin/env node
/**
 * @file `check-react-free` — quality gate for `core-015`.
 *
 * Enforces architecture §7: **`src/runtime/` and `src/config/schema.ts`
 * must never import `react` or `react-dom`.** Those two regions are the
 * React-free plugin engine and the authoritative Zod schema; any React
 * import sneaking in would couple pure-logic code to React's render
 * tree and break Node-only consumers (SSR pipelines, CLI plugin
 * authors, tests that never mount `<Studio>`).
 *
 * The check walks every `.ts` / `.tsx` file under `src/runtime/` and
 * the single file `src/config/schema.ts`, reads them as text, and
 * scans for any `from 'react'`, `from "react"`, `from 'react-dom'`,
 * or `from "react-dom"` line. A match prints the offending file +
 * line and exits non-zero so CI fails the PR.
 *
 * Implemented in plain Node (no `ripgrep` dependency) so it runs on
 * any CI image — `ubuntu-latest` sometimes ships without `rg` and we
 * do not want this gate to depend on the runner's toolbox.
 *
 * @see {@link ../docs/tasks/core-015-public-api-gates.md | core-015}
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const RUNTIME_DIR = resolve(PACKAGE_ROOT, "src/runtime");
const SCHEMA_FILE = resolve(PACKAGE_ROOT, "src/config/schema.ts");

/**
 * Matches:
 *
 * - `import ... from "react"`
 * - `import ... from 'react-dom'`
 * - `import type { ... } from "react"`
 * - `from "react/jsx-runtime"` (subpath imports still count — the
 *   runtime layer must stay React-free even for type-only jsx)
 * - Dynamic `import("react")` expressions.
 *
 * Deliberately does **not** match `reactive`, `react-query`, etc.;
 * the trailing `['"]` or `/` enforces an exact boundary.
 */
const REACT_IMPORT_PATTERN =
	/\bfrom\s+['"](react|react-dom)(\/[^'"]*)?['"]|\bimport\s*\(\s*['"](react|react-dom)(\/[^'"]*)?['"]/;

/**
 * Recursively yield every `.ts` / `.tsx` file under `dir`, skipping
 * `__tests__/` directories and `.test.ts` / `.test.tsx` files. Test
 * files are allowed to import React (they render components through
 * testing-library), and the React-free rule applies to the shipped
 * code only.
 */
async function* walkSourceFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__" || entry.name === "node_modules") {
				continue;
			}
			yield* walkSourceFiles(full);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		const name = entry.name;
		if (
			(name.endsWith(".ts") || name.endsWith(".tsx")) &&
			!name.endsWith(".test.ts") &&
			!name.endsWith(".test.tsx") &&
			!name.endsWith(".spec.ts") &&
			!name.endsWith(".spec.tsx")
		) {
			yield full;
		}
	}
}

/**
 * Scan a single file for React imports. Returns an array of
 * `{ line, text }` offenders so the final report can cite each hit.
 */
async function scanFile(filePath) {
	const text = await readFile(filePath, "utf8");
	const lines = text.split(/\r?\n/);
	const hits = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (REACT_IMPORT_PATTERN.test(line)) {
			hits.push({ line: i + 1, text: line.trim() });
		}
	}
	return hits;
}

async function main() {
	const offenders = [];

	// Walk the runtime directory.
	for await (const file of walkSourceFiles(RUNTIME_DIR)) {
		const hits = await scanFile(file);
		if (hits.length > 0) {
			offenders.push({ file, hits });
		}
	}

	// Check the single schema file.
	try {
		const schemaHits = await scanFile(SCHEMA_FILE);
		if (schemaHits.length > 0) {
			offenders.push({ file: SCHEMA_FILE, hits: schemaHits });
		}
	} catch (err) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			console.error(
				`check-react-free: expected schema file at ${relative(PACKAGE_ROOT, SCHEMA_FILE)} but it was not found.`,
			);
			process.exit(1);
		}
		throw err;
	}

	if (offenders.length === 0) {
		console.log(
			"check-react-free: OK — no React imports found in src/runtime/ or src/config/schema.ts",
		);
		return;
	}

	console.error("check-react-free: FAIL");
	console.error("");
	console.error(
		"The following files import `react` or `react-dom` but belong to the React-free layer:",
	);
	console.error("");
	for (const { file, hits } of offenders) {
		const rel = relative(PACKAGE_ROOT, file);
		for (const hit of hits) {
			console.error(`  ${rel}:${hit.line}  ${hit.text}`);
		}
	}
	console.error("");
	console.error(
		"Move React-dependent code to src/react/ or refactor the import away. See architecture §7.",
	);
	process.exit(1);
}

main().catch((err) => {
	console.error("check-react-free: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
