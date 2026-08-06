#!/usr/bin/env node
/**
 * PLAN-0025 P0-03 — Puck public-surface gate.
 *
 * 1) Deep-import ban: source may import only the public entry points
 *    `@puckeditor/core`, `@puckeditor/core/rsc`, and
 *    `@puckeditor/core/puck.css`. Any `@puckeditor/core/dist/*` or
 *    other internal path (reducer, lib, chunk) fails the gate — the
 *    refactor's Puck contract permits only published API.
 * 2) Single resolution (plan §15 gate 1): `pnpm-lock.yaml` must
 *    resolve exactly ONE `@puckeditor/core` version, equal to the
 *    exact pin in the root `package.json` devDependencies. This is
 *    what lets every other workspace manifest keep semver ranges
 *    (P0-01 resolved policy) without risking version skew.
 *
 * No dependencies; runs on bare node. Scans `apps/` and `packages/`
 * (the nested components workspace lives under `packages/` and is
 * included). Skips build output and vendored trees.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set([
	"node_modules",
	"dist",
	".next",
	".vercel",
	".output",
	".turbo",
	"coverage",
	".claude",
	".git",
	"storybook-static",
]);
const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const DEEP_IMPORT = /["']@puckeditor\/core\/([^"']+)["']/g;
const ALLOWED_SUBPATHS = new Set(["rsc", "puck.css"]);

/** @returns {string[]} every source file under dir, recursively */
function collect(dir, out) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) collect(join(dir, entry.name), out);
		} else if (SOURCE_EXT.test(entry.name)) {
			out.push(join(dir, entry.name));
		}
	}
	return out;
}

const files = SCAN_ROOTS.flatMap((r) => collect(join(ROOT, r), []));
const violations = [];
for (const file of files) {
	const lines = readFileSync(file, "utf8").split("\n");
	lines.forEach((line, i) => {
		for (const match of line.matchAll(DEEP_IMPORT)) {
			const subpath = match[1];
			if (!ALLOWED_SUBPATHS.has(subpath)) {
				violations.push(
					`${relative(ROOT, file)}:${i + 1} — "@puckeditor/core/${subpath}" (allowed: bare, /rsc, /puck.css)`,
				);
			}
		}
	});
}

const lock = readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8");
const resolved = new Set(
	[...lock.matchAll(/@puckeditor\/core@(\d[0-9A-Za-z.-]*)/g)].map((m) => m[1]),
);
const rootManifest = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf8"),
);
const pin = rootManifest.devDependencies?.["@puckeditor/core"];

const errors = [...violations];
if (typeof pin !== "string" || !/^\d/.test(pin)) {
	errors.push(
		`root package.json must pin @puckeditor/core to an exact version (found: ${pin})`,
	);
}
if (resolved.size !== 1) {
	errors.push(
		`pnpm-lock.yaml resolves ${resolved.size} @puckeditor/core versions (${[...resolved].join(", ")}); exactly one is required`,
	);
} else if (pin && ![...resolved][0].startsWith(pin)) {
	errors.push(
		`lockfile resolves @puckeditor/core@${[...resolved][0]} but the root pin is ${pin}`,
	);
}

if (errors.length > 0) {
	console.error(`check:puck-imports FAILED (${errors.length} problem(s)):`);
	for (const e of errors) console.error(`  ${e}`);
	process.exit(1);
}
console.log(
	`check:puck-imports OK — ${files.length} files scanned, 0 deep imports, single resolution @puckeditor/core@${[...resolved][0]} matches root pin`,
);
