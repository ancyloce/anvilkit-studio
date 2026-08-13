#!/usr/bin/env node
/**
 * @file `check-react-free` — quality gate for `core-015`.
 *
 * Enforces the package's React-free source boundaries: `src/runtime/`,
 * `src/editor/`, `src/puck/`, and `src/config/schema.ts`. The sole
 * exception is `src/puck/fields/authoring-fields.tsx`, an intentional
 * React adapter exported only through `@anvilkit/core/react/editor`.
 *
 * In those regions the gate rejects direct React imports, `"use
 * client"` directives, and local imports into `src/react/`. The last
 * rule catches a pure module reaching through a client-marked adapter,
 * which a package-name-only scan misses (review 0037 P2-5).
 *
 * Implemented in plain Node (no `ripgrep` dependency) so it runs on
 * any CI image — `ubuntu-latest` sometimes ships without `rg` and we
 * do not want this gate to depend on the runner's toolbox.
 *
 * ### DOM-global scan (review finding M2)
 *
 * `src/runtime/` must also stay environment-agnostic. The package
 * tsconfig's `lib` includes `DOM`, so a stray `window.` / `document.` /
 * `localStorage` reference would typecheck **and** slip past the React
 * import scan above. A second pass over the runtime tree (only) strips
 * comments and string literals first — so English prose like "a sliding
 * window" never false-positives — then flags any bare DOM-global
 * identifier left in actual runtime code. It is a line-based heuristic:
 * it does not resolve `@/…` aliases, so the *transitive* React-leak case
 * (a runtime file importing a React-touching module) is covered
 * separately by the `/runtime` React-free bundle assertion in
 * `check-bundle-budget.mjs`.
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
const EDITOR_DIR = resolve(PACKAGE_ROOT, "src/editor");
const PUCK_DIR = resolve(PACKAGE_ROOT, "src/puck");
const SCHEMA_FILE = resolve(PACKAGE_ROOT, "src/config/schema.ts");
const PUCK_REACT_ADAPTER = resolve(PUCK_DIR, "fields/authoring-fields.tsx");

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

/** A React-free module must not reach into the local client layer. */
const LOCAL_REACT_LAYER_IMPORT_PATTERN =
	/\bfrom\s+['"][^'"]*\/react(?:\/[^'"]*)?['"]|\bimport\s*\(\s*['"][^'"]*\/react(?:\/[^'"]*)?['"]/;

/** Client directives belong at React entry points, never in pure layers. */
const USE_CLIENT_DIRECTIVE_PATTERN = /^\s*['"]use client['"];?\s*$/;

/**
 * Browser-only globals the React-free runtime must never reference. A
 * match is an environment dependency (`window.matchMedia`,
 * `document.getElementById`, `localStorage.setItem`, …) that breaks
 * Node-only consumers. Scanned only **after** comments + strings are
 * stripped (see {@link stripCommentsAndStrings}), so the bare `\b`
 * boundary is safe — prose occurrences of "window"/"document" are gone
 * by the time this runs. The negative lookbehind keeps member access
 * like `foo.document` from matching a host object's own property.
 */
const DOM_GLOBAL_PATTERN =
	/(?<![.\w$])(window|document|localStorage|sessionStorage|navigator)\b/;

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
		if (
			REACT_IMPORT_PATTERN.test(line) ||
			LOCAL_REACT_LAYER_IMPORT_PATTERN.test(line) ||
			USE_CLIENT_DIRECTIVE_PATTERN.test(line)
		) {
			hits.push({ line: i + 1, text: line.trim() });
		}
	}
	return hits;
}

/**
 * Blank out `//` and `/* *\/` comments and string / template literals,
 * replacing their characters with spaces while preserving newlines so
 * line numbers stay accurate. A tiny hand-rolled scanner — runtime
 * source is small and this avoids pulling a parser into the gate. Good
 * enough for the DOM-global heuristic: it strips the contexts (prose,
 * log strings) where a DOM word could appear without being a real
 * reference. `${…}` template interpolations are blanked too, which is an
 * accepted blind spot (runtime has no DOM usage inside templates).
 */
function stripCommentsAndStrings(src) {
	let out = "";
	let i = 0;
	const n = src.length;
	const blank = (ch) => (ch === "\n" ? "\n" : " ");
	while (i < n) {
		const c = src[i];
		const d = src[i + 1];
		if (c === "/" && d === "/") {
			while (i < n && src[i] !== "\n") {
				out += " ";
				i += 1;
			}
			continue;
		}
		if (c === "/" && d === "*") {
			out += "  ";
			i += 2;
			while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
				out += blank(src[i]);
				i += 1;
			}
			out += "  ";
			i += 2;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") {
			const quote = c;
			out += " ";
			i += 1;
			while (i < n && src[i] !== quote) {
				if (src[i] === "\\") {
					out += "  ";
					i += 2;
					continue;
				}
				out += blank(src[i]);
				i += 1;
			}
			out += " ";
			i += 1;
			continue;
		}
		out += c;
		i += 1;
	}
	return out;
}

/**
 * Scan a single runtime file for DOM-global references, ignoring any
 * inside comments or string literals. Returns `{ line, text }` offenders.
 */
async function scanFileForDomGlobals(filePath) {
	const raw = await readFile(filePath, "utf8");
	const lines = stripCommentsAndStrings(raw).split(/\r?\n/);
	const hits = [];
	for (let i = 0; i < lines.length; i += 1) {
		if (DOM_GLOBAL_PATTERN.test(lines[i])) {
			hits.push({ line: i + 1, text: lines[i].trim() });
		}
	}
	return hits;
}

async function main() {
	const offenders = [];
	const domOffenders = [];

	// Walk the runtime directory: every file is checked for both React
	// imports and DOM-global references.
	for await (const file of walkSourceFiles(RUNTIME_DIR)) {
		const hits = await scanFile(file);
		if (hits.length > 0) {
			offenders.push({ file, hits });
		}
		const domHits = await scanFileForDomGlobals(file);
		if (domHits.length > 0) {
			domOffenders.push({ file, hits: domHits });
		}
	}

	// The editor engine and Puck commit layer are React-free. The one
	// authoring-fields adapter is intentionally React-backed and exported
	// only from the React editor subpath, so keep the exception exact.
	for (const dir of [EDITOR_DIR, PUCK_DIR]) {
		for await (const file of walkSourceFiles(dir)) {
			if (file === PUCK_REACT_ADAPTER) continue;
			const hits = await scanFile(file);
			if (hits.length > 0) {
				offenders.push({ file, hits });
			}
		}
	}

	// Check the single schema file.
	try {
		const schemaHits = await scanFile(SCHEMA_FILE);
		if (schemaHits.length > 0) {
			offenders.push({ file: SCHEMA_FILE, hits: schemaHits });
		}
	} catch (err) {
		if (
			err &&
			typeof err === "object" &&
			"code" in err &&
			err.code === "ENOENT"
		) {
			console.error(
				`check-react-free: expected schema file at ${relative(PACKAGE_ROOT, SCHEMA_FILE)} but it was not found.`,
			);
			process.exit(1);
		}
		throw err;
	}

	if (offenders.length === 0 && domOffenders.length === 0) {
		console.log(
			"check-react-free: OK — runtime/editor/puck boundaries contain no React imports, client directives, or local React-layer imports; no DOM globals in src/runtime/",
		);
		return;
	}

	console.error("check-react-free: FAIL");

	if (offenders.length > 0) {
		console.error("");
		console.error(
			"The following files import React, declare a client boundary, or reach into src/react/ from a React-free layer:",
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
	}

	if (domOffenders.length > 0) {
		console.error("");
		console.error(
			"The following src/runtime/ files reference a browser-only DOM global — the runtime must stay environment-agnostic (Node / SSR / CLI):",
		);
		console.error("");
		for (const { file, hits } of domOffenders) {
			const rel = relative(PACKAGE_ROOT, file);
			for (const hit of hits) {
				console.error(`  ${rel}:${hit.line}  ${hit.text}`);
			}
		}
		console.error("");
		console.error(
			"Move DOM-dependent code to src/react/ or src/studio/, or guard it behind a host-injected seam. See architecture §7.",
		);
	}

	process.exit(1);
}

main().catch((err) => {
	console.error("check-react-free: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
