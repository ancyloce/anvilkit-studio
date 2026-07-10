#!/usr/bin/env node
/**
 * @file `check-no-headless-import` — quality gate for architecture §4
 * (A5: declare & guard the core ↔ ir/schema/validator contract).
 *
 * Enforces the dependency direction: **`@anvilkit/core` is a
 * *consumer* of the headless packages' contracts, never the reverse.**
 * `@anvilkit/ir` imports `PageIR` from `@anvilkit/core/types` and
 * declares `@anvilkit/core` a peer dependency. If `src/` ever imports
 * `@anvilkit/ir`, `@anvilkit/schema`, or `@anvilkit/validator`, the
 * acyclic layering inverts and `PageIR` can drift between core's
 * `src/types/ir.ts` (the source of truth) and the IR package.
 *
 * `madge --circular` only catches *cycles*; it does not catch a
 * one-directional inverse import (core → ir) that has no cycle yet.
 * This gate is the precise guard for that.
 *
 * Implemented in plain Node (no `ripgrep` dependency) so it runs on
 * any CI image, mirroring `check-react-free.mjs`.
 *
 * @see {@link ../../../docs/ai-context/core-functional-architecture.md | §4 / §6 A5}
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const SRC_DIR = resolve(PACKAGE_ROOT, "src");

/**
 * Forbidden headless packages. `@anvilkit/core` must not import any of
 * these (including subpaths). Type-only imports count too — a
 * `import type { ... } from "@anvilkit/ir"` still couples the contract
 * direction even though it erases at build time.
 */
const FORBIDDEN = ["@anvilkit/ir", "@anvilkit/schema", "@anvilkit/validator"];

/**
 * True iff `spec` is a forbidden package or one of its subpaths
 * (`@anvilkit/ir`, `@anvilkit/ir/foo`) — but **not** a different
 * package that merely shares the prefix (`@anvilkit/ir-utils`).
 */
function isForbiddenSpecifier(spec) {
	return FORBIDDEN.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`));
}

/**
 * Recursively yield every `.ts` / `.tsx` file under `dir`, skipping
 * `__tests__/` directories and `.test.*` / `.spec.*` files. Tests may
 * legitimately import the headless packages to assert cross-package
 * behavior; the rule applies to shipped code only.
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
 * Matches a string literal (single/double/backtick, with escapes) OR
 * a block comment OR a line comment. Used to neutralize comments
 * before import-matching without corrupting `//` inside string
 * literals (e.g. `"https://example.com"`).
 */
const STRING_OR_COMMENT =
	/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/**
 * Replace every comment with same-length whitespace **while
 * preserving newlines and total length**, so byte offsets (and thus
 * the line numbers {@link scanFile} computes) are unchanged. String
 * literals are passed through untouched. This makes the gate robust
 * to comments placed anywhere inside an import — bundler pragmas
 * (`import(/* @vite-ignore *​/ "@anvilkit/ir")`), trailing line
 * comments, etc. — instead of enumerating comment positions in the
 * import regex (codex-review P2, iteration 3). A commented-out import
 * is correctly *not* flagged: it is not a real dependency.
 */
function stripCommentsPreservingLayout(text) {
	return text.replace(STRING_OR_COMMENT, (match, stringLiteral) => {
		if (stringLiteral !== undefined) {
			return stringLiteral;
		}
		// Comment: keep \n, blank everything else (length-preserving).
		let out = "";
		for (let i = 0; i < match.length; i += 1) {
			out += match.charCodeAt(i) === 10 ? "\n" : " ";
		}
		return out;
	});
}

/** 1-based line number of byte offset `idx` in `text`. */
function lineOf(text, idx) {
	let line = 1;
	for (let i = 0; i < idx; i += 1) {
		if (text.charCodeAt(i) === 10 /* \n */) {
			line += 1;
		}
	}
	return line;
}

/**
 * Read a string literal starting at `text[start]` (a `"`, `'`, or
 * `` ` `` delimiter). Returns `{ value, end }` where `end` is the
 * index just past the closing delimiter. Escapes are respected; an
 * unterminated literal consumes to EOF (best-effort — TS would not
 * compile it anyway).
 */
function readStringLiteral(text, start) {
	const quote = text[start];
	let value = "";
	let i = start + 1;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "\\") {
			value += text[i + 1] ?? "";
			i += 2;
			continue;
		}
		if (ch === quote) {
			return { value, end: i + 1 };
		}
		value += ch;
		i += 1;
	}
	return { value, end: text.length };
}

/**
 * Walk the (comment-stripped) source as a light token stream and flag
 * a string literal **only when it sits in import-specifier position**
 * — i.e. the preceding significant token is the `from` keyword, the
 * `import` keyword (bare side-effect import), or `import` `(` (dynamic
 * import). A string that is just data (`const s = 'import "x"'`) is
 * consumed whole and never inspected, so its contents cannot
 * false-positive (codex-review P2, iteration 4). Multiline forms work
 * for free because inter-token whitespace/newlines are skipped.
 *
 * This is a heuristic scanner, not a full TS parser, but it covers
 * every real import/`export … from` form and rejects the data-string,
 * comment, prefix-collision (`@anvilkit/ir-utils`), and
 * `Array.from("…")` cases.
 */
function scanSource(text) {
	const hits = [];
	const isIdentChar = (c) => c !== undefined && /[\w$]/.test(c);
	// Import-position state.
	let afterFrom = false; // last keyword was `from`
	let afterImport = false; // last keyword was `import`
	let afterImportParen = false; // saw `import` then `(`
	let afterRequire = false; // last identifier was `require`
	let afterRequireParen = false; // saw `require` then `(`
	const clear = () => {
		afterFrom = false;
		afterImport = false;
		afterImportParen = false;
		afterRequire = false;
		afterRequireParen = false;
	};

	let i = 0;
	while (i < text.length) {
		const ch = text[i];

		if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
			i += 1;
			continue;
		}

		if (ch === '"' || ch === "'" || ch === "`") {
			const { value, end } = readStringLiteral(text, i);
			if (
				(afterFrom || afterImport || afterImportParen || afterRequireParen) &&
				isForbiddenSpecifier(value)
			) {
				const kw = afterFrom
					? "from"
					: afterRequireParen
						? "require"
						: "import";
				hits.push({
					line: lineOf(text, i),
					text: `${kw} ${text[i]}${value}${text[i]}`,
				});
			}
			clear();
			i = end; // skip the whole literal — never scan its interior
			continue;
		}

		if (isIdentChar(ch)) {
			let j = i;
			while (j < text.length && isIdentChar(text[j])) {
				j += 1;
			}
			const word = text.slice(i, j);
			if (word === "from") {
				clear();
				afterFrom = true;
			} else if (word === "import") {
				clear();
				afterImport = true;
			} else if (word === "require") {
				// Catches `require("pkg")` and the TS import-equals
				// form `import X = require("pkg")` (codex-review P2).
				// In this ESM/TS `src/`, a `require()` of a workspace
				// package is itself the forbidden dependency.
				clear();
				afterRequire = true;
			} else {
				// Any other identifier breaks import-specifier position
				// (e.g. `import type` → `type` clears the bare-import
				// flag; `from` used as `Array.from` is handled by the
				// `(` branch below).
				clear();
			}
			i = j;
			continue;
		}

		if (ch === "(") {
			// `import(` / `require(` keep specifier position; `.from(`
			// / `something(` do not.
			if (afterImport) {
				afterImportParen = true;
				afterImport = false;
			} else if (afterRequire) {
				afterRequireParen = true;
				afterRequire = false;
			} else {
				clear();
			}
			i += 1;
			continue;
		}

		// Any other punctuation (`;` `,` `{` `}` `=` `.` `*` …) ends
		// import-specifier position. `import { a } from "x"` still
		// works: `{`/`}` clear, then `from` re-arms `afterFrom`.
		clear();
		i += 1;
	}
	return hits;
}

/**
 * Strip comments (layout-preserving) then scan for forbidden imports
 * in specifier position only.
 */
async function scanFile(filePath) {
	const raw = await readFile(filePath, "utf8");
	const text = stripCommentsPreservingLayout(raw);
	return scanSource(text);
}

async function main() {
	const offenders = [];
	for await (const file of walkSourceFiles(SRC_DIR)) {
		const hits = await scanFile(file);
		if (hits.length > 0) {
			offenders.push({ file, hits });
		}
	}

	if (offenders.length === 0) {
		console.log(
			"check-no-headless-import: OK — src/ does not import @anvilkit/ir, @anvilkit/schema, or @anvilkit/validator",
		);
		return;
	}

	console.error("check-no-headless-import: FAIL");
	console.error("");
	console.error(
		"`@anvilkit/core` must not import the headless packages — it is their *consumer*,",
	);
	console.error(
		"not the reverse. The following src/ files invert the contract direction:",
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
		"`PageIR` lives in src/types/ir.ts (source of truth); @anvilkit/ir consumes it,",
	);
	console.error(
		"declaring @anvilkit/core a peer dep. See core-functional-architecture.md §4 / §6 A5.",
	);
	process.exit(1);
}

main().catch((err) => {
	console.error("check-no-headless-import: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
