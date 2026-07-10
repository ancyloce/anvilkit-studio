#!/usr/bin/env node
/**
 * @file `check-react-free` — the foundation-layer React gate for
 * `@anvilkit/utils` (restructure plan 0001, Phase 4).
 *
 * The main entry must stay React-free so plain-Node consumers of
 * `debounce` / `deepMerge` / `generateId` / `invariant` never need the
 * optional `react` peer installed. Two rules:
 *
 * 1. No `src/` module may import `react` / `react-dom` — except the
 *    sanctioned subpath module `get-strict-context.ts`, which is
 *    published ONLY via `@anvilkit/utils/get-strict-context` and is
 *    deliberately excluded from the barrel.
 * 2. `src/index.ts` must not re-export `./get-strict-context` (a barrel
 *    re-export would statically pull React back into the main entry's
 *    module graph).
 *
 * Mirrors `packages/foundation/contracts/scripts/check-react-free.mjs`.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const SOURCE_DIR = resolve(PACKAGE_ROOT, "src");

/** The one React-coupled module, published only via its subpath. */
const REACT_ALLOWED_FILES = new Set(["get-strict-context.ts"]);

const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;
const REACT_IMPORT_PATTERN =
	/\bfrom\s+['"](react|react-dom)(\/[^'"]*)?['"]|\bimport\s*\(\s*['"](react|react-dom)(\/[^'"]*)?['"]\s*\)/;
const STRICT_CONTEXT_REEXPORT_PATTERN =
	/\bfrom\s+['"]\.\/get-strict-context(\.[cm]?js)?['"]/;

async function* walkSourceFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__" || entry.name === "node_modules") {
				continue;
			}
			yield* walkSourceFiles(fullPath);
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (
			SOURCE_EXTENSIONS.has(extname(entry.name)) &&
			!TEST_FILE_PATTERN.test(entry.name) &&
			!REACT_ALLOWED_FILES.has(entry.name)
		) {
			yield fullPath;
		}
	}
}

async function scanFile(filePath) {
	const text = await readFile(filePath, "utf8");
	const lines = text.split(/\r?\n/);
	const hits = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (REACT_IMPORT_PATTERN.test(line)) {
			hits.push({ line: index + 1, text: line.trim() });
		}
		if (
			filePath === resolve(SOURCE_DIR, "index.ts") &&
			STRICT_CONTEXT_REEXPORT_PATTERN.test(line)
		) {
			hits.push({ line: index + 1, text: line.trim() });
		}
	}

	return hits;
}

async function main() {
	const offenders = [];

	for await (const filePath of walkSourceFiles(SOURCE_DIR)) {
		const hits = await scanFile(filePath);
		if (hits.length > 0) {
			offenders.push({ filePath, hits });
		}
	}

	if (offenders.length === 0) {
		console.log(
			"check-react-free: OK — main entry imports no react/react-dom and does not re-export ./get-strict-context",
		);
		return;
	}

	console.error("check-react-free: FAIL");
	console.error("");
	console.error(
		"The following files would couple the @anvilkit/utils main entry to React:",
	);
	console.error("");

	for (const { filePath, hits } of offenders) {
		for (const hit of hits) {
			console.error(
				`  ${relative(PACKAGE_ROOT, filePath)}:${hit.line}  ${hit.text}`,
			);
		}
	}

	console.error("");
	console.error(
		"The main entry must stay React-free (foundation layer). React-coupled helpers",
	);
	console.error(
		"live on their own subpath (like ./get-strict-context) and out of the barrel.",
	);
	process.exit(1);
}

main().catch((error) => {
	console.error("check-react-free: crashed unexpectedly");
	console.error(error);
	process.exit(2);
});
