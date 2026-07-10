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
		if (REACT_IMPORT_PATTERN.test(line)) {
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
			"check-react-free: OK — no React imports in src/runtime/ or src/config/schema.ts, and no DOM globals in src/runtime/",
		);
		return;
	}

	console.error("check-react-free: FAIL");

	if (offenders.length > 0) {
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
