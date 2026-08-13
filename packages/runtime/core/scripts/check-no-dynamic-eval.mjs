#!/usr/bin/env node
/**
 * @file `check-no-dynamic-eval` — the shipped-bytes gate for the
 * prohibited primitives in DD-0019 §19 **and §29**
 * (PLAN-0020 CORE-P3-004, extended by CORE-P4-004; ED-BIND-001).
 *
 * The filename predates §29 and is kept so `check:all`, CI, and the
 * pre-push hook keep working; read it as "no unsafe primitives".
 * §29's prohibited list names `eval`, `new Function`, arbitrary script
 * injection, and `postMessage("*")` — the last of which is checked
 * here for the same reason as the first two: it is a property of the
 * shipped bytes, not of any code path a unit test happens to call.
 *
 * DD-0019 §19 promises that binding expressions can never execute
 * arbitrary JavaScript. Two things uphold that, and only one of them is
 * testable by unit tests:
 *
 * 1. `SafeExpression` has no call node, so a function invocation is
 *    structurally unrepresentable — covered by the evaluator's suite.
 * 2. Core itself never reaches for a dynamic-code primitive. **That is
 *    what this gate checks**, and it is the half a unit test cannot
 *    prove: a test can only show the code paths it thought to call are
 *    safe, whereas this shows no such primitive exists anywhere in the
 *    shipped bytes.
 *
 * The plan calls for a "greppable gate", and this is deliberately that
 * — a blunt textual scan over shipped `src/` **and** built `dist/`,
 * rather than an AST analysis. Scanning `dist/` matters independently:
 * that is what consumers actually run, so a primitive introduced by a
 * bundler transform or an inlined dependency is caught even though it
 * appears in no source file.
 *
 * Comments are stripped (layout-preserving) before scanning, mirroring
 * `check-no-headless-import.mjs`, so prose that *mentions* these
 * primitives — including this file's own rationale and the evaluator's
 * header — never trips the gate. String literals are left intact on
 * purpose: `globalThis["ev" + "al"]` is exactly the evasion a security
 * gate should refuse to be clever about.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");

/** Scanned roots: shipped source and the built output consumers run. */
const SCAN_ROOTS = ["src", "dist"];

/** File extensions worth scanning in either root. */
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".js", ".cjs", ".mjs"];

/**
 * Dynamic-code primitives. Each entry is a pattern plus the reason it
 * is forbidden, so a failure explains itself without a doc lookup.
 *
 * `Function(` covers both `new Function(...)` and the bare call form
 * `Function("return 1")`, which is just as much a compiler. The
 * `\b` guards keep `evaluateExpression` and `MyFunction(` from
 * matching.
 */
const FORBIDDEN = [
	{
		pattern: /\beval\s*\(/g,
		label: "eval(",
		why: "compiles and runs arbitrary source text",
	},
	{
		pattern: /\bnew\s+Function\s*\(/g,
		label: "new Function(",
		why: "the Function constructor is a compiler",
	},
	{
		pattern: /(?<![.\w$])Function\s*\(\s*["'`]/g,
		label: "Function(<string>)",
		why: "bare Function() call with a source string",
	},
	// §29: "unvalidated `postMessage("*")`" is a prohibited behavior.
	// A wildcard target origin broadcasts the message to whatever
	// document currently occupies the frame, so anything sent this way
	// is readable by an attacker who can navigate it. The bound on the
	// argument scan keeps the match inside one call's parentheses.
	{
		pattern: /\bpostMessage\s*\([^)]{0,300}?["'`]\*["'`]/g,
		label: 'postMessage(…, "*")',
		why: "wildcard target origin leaks the message to any document in the frame",
	},
	// §29: "arbitrary script/style injection". `document.write` can
	// introduce executable markup into a document Core does not own.
	{
		pattern: /\bdocument\s*\.\s*write(?:ln)?\s*\(/g,
		label: "document.write(",
		why: "injects arbitrary markup into a document Core does not own",
	},
];

/**
 * Matches a string literal (single/double/backtick, with escapes) OR a
 * block comment OR a line comment — the same tokenizer
 * `check-no-headless-import.mjs` uses.
 */
const STRING_OR_COMMENT =
	/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/**
 * Blank out comments while preserving newlines and total length, so
 * reported line numbers stay accurate. String literals pass through
 * untouched (see the file header: string-built evasions must remain
 * visible to the scan).
 */
function stripCommentsPreservingLayout(text) {
	return text.replace(STRING_OR_COMMENT, (match, stringLiteral) => {
		if (stringLiteral !== undefined) {
			return stringLiteral;
		}
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
		if (text.charCodeAt(i) === 10) {
			line += 1;
		}
	}
	return line;
}

/** Recursively yield scannable files, skipping tests and sourcemaps. */
async function* walkFiles(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return; // Root absent (e.g. dist/ before a build) — handled by caller.
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__" || entry.name === "node_modules") {
				continue;
			}
			yield* walkFiles(full);
			continue;
		}
		if (!entry.isFile()) continue;
		const name = entry.name;
		if (
			name.endsWith(".test.ts") ||
			name.endsWith(".test.tsx") ||
			name.endsWith(".spec.ts") ||
			name.endsWith(".spec.tsx") ||
			name.endsWith(".map")
		) {
			continue;
		}
		if (SCANNED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
			yield full;
		}
	}
}

async function scanFile(filePath) {
	const raw = await readFile(filePath, "utf8");
	const text = stripCommentsPreservingLayout(raw);
	const hits = [];
	for (const { pattern, label, why } of FORBIDDEN) {
		pattern.lastIndex = 0;
		let match = pattern.exec(text);
		while (match !== null) {
			hits.push({ line: lineOf(text, match.index), label, why });
			match = pattern.exec(text);
		}
	}
	return hits;
}

async function main() {
	const offenders = [];
	const scanned = [];
	let files = 0;

	for (const root of SCAN_ROOTS) {
		const abs = resolve(PACKAGE_ROOT, root);
		try {
			await stat(abs);
		} catch {
			// `dist/` is absent until a build runs. Say so rather than
			// reporting a silent pass over nothing — a gate that quietly
			// scans zero files is worse than no gate.
			console.warn(
				`check-no-dynamic-eval: NOTE — ${root}/ not present, skipped (run \`pnpm build\` to include it)`,
			);
			continue;
		}
		scanned.push(root);
		for await (const file of walkFiles(abs)) {
			files += 1;
			const hits = await scanFile(file);
			if (hits.length > 0) offenders.push({ file, hits });
		}
	}

	if (offenders.length === 0) {
		console.log(
			`check-no-dynamic-eval: OK — no eval / Function-constructor / postMessage("*") / document.write primitive in ${scanned.join(", ")} (${files} files scanned)`,
		);
		return;
	}

	console.error("check-no-dynamic-eval: FAIL");
	console.error("");
	console.error(
		"DD-0019 §19 guarantees binding expressions never execute arbitrary",
	);
	console.error("JavaScript, and §29 prohibits dynamic code, arbitrary markup");
	console.error(
		'injection, and unvalidated postMessage("*"). A prohibited primitive',
	);
	console.error(
		"in shipped output breaks that regardless of who calls it. Offenders:",
	);
	console.error("");
	for (const { file, hits } of offenders) {
		const rel = relative(PACKAGE_ROOT, file);
		for (const hit of hits) {
			console.error(`  ${rel}:${hit.line}  ${hit.label} — ${hit.why}`);
		}
	}
	console.error("");
	console.error(
		"The safe expression evaluator lives in src/editor/bindings/evaluate.ts;",
	);
	console.error(
		"extend the closed SafeExpression AST instead of reaching for a compiler.",
	);
	process.exit(1);
}

main().catch((err) => {
	console.error("check-no-dynamic-eval: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
