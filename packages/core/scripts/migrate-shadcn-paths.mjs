#!/usr/bin/env node
/**
 * @file `migrate-shadcn-paths` — relocate files installed by the shadcn
 * CLI into the project's primitives tree.
 *
 * The shadcn CLI joins each registry item's bare `target` onto the
 * configured `aliases.ui` root, which for animate-ui produces a
 * deeply-nested `components/animate-ui/...` layout plus loose
 * `hooks/` and `lib/` folders directly under `src/`. This package
 * keeps every primitive (and its co-located helpers) under
 * `src/react/studio/primitives/`, so each install needs a follow-up
 * move + import rewrite.
 *
 * The script is idempotent: missing source directories are skipped,
 * and the import rewrites only fire on the legacy `@/studio/hooks/`
 * and `@/studio/lib/` aliases left behind by the shadcn installer.
 *
 * Usage:
 *   pnpm --filter @anvilkit/core migrate:shadcn-paths
 *   pnpm --filter @anvilkit/core migrate:shadcn-paths -- --dry-run
 */

import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const SRC = resolve(PACKAGE_ROOT, "src");

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Directories to relocate. `from` and `to` are relative to `src/`.
 * Order doesn't matter — each move is independent.
 */
const MOVES = [
	{ from: "components/animate-ui", to: "react/studio/primitives/animate-ui" },
	{ from: "hooks", to: "react/studio/primitives/hooks" },
	{ from: "lib", to: "react/studio/primitives/lib" },
];

/**
 * Import-specifier rewrites applied across `src/` after the moves.
 * The shadcn installer authored cross-references using the legacy
 * `@/studio/hooks/` and `@/studio/lib/` aliases (which previously
 * resolved to the misplaced shadcn install roots). After relocation
 * the same files live under `@/primitives/`, so every reference must
 * be rewritten to match.
 */
const IMPORT_REWRITES = [
	[/(['"`])@\/studio\/hooks\//g, "$1@/primitives/hooks/"],
	[/(['"`])@\/studio\/lib\//g, "$1@/primitives/lib/"],
];

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
			return false;
		}
		throw err;
	}
}

async function isEmptyDir(path) {
	const entries = await readdir(path);
	return entries.length === 0;
}

async function* walkSourceFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") {
				continue;
			}
			yield* walkSourceFiles(full);
			continue;
		}
		if (!entry.isFile()) {
			continue;
		}
		if (full.endsWith(".ts") || full.endsWith(".tsx")) {
			yield full;
		}
	}
}

async function moveDir(from, to) {
	const fromAbs = join(SRC, from);
	const toAbs = join(SRC, to);
	const label = `${from} → ${to}`;

	if (!(await exists(fromAbs))) {
		console.log(`  • skip ${label} (source not present)`);
		return false;
	}

	if (await exists(toAbs)) {
		if (!(await isEmptyDir(toAbs))) {
			throw new Error(
				`destination "src/${to}" already exists and is not empty — refusing to overwrite. Resolve manually or remove the destination first.`,
			);
		}
		if (DRY_RUN) {
			console.log(`  ✓ would remove empty destination src/${to}`);
		} else {
			await rm(toAbs, { recursive: true, force: true });
		}
	}

	if (DRY_RUN) {
		console.log(`  ✓ would move ${label}`);
		return true;
	}

	await mkdir(dirname(toAbs), { recursive: true });
	await rename(fromAbs, toAbs);
	console.log(`  ✓ moved ${label}`);
	return true;
}

async function rewriteImports(rootDir) {
	let touched = 0;
	for await (const file of walkSourceFiles(rootDir)) {
		const original = await readFile(file, "utf8");
		let next = original;
		for (const [pattern, replacement] of IMPORT_REWRITES) {
			next = next.replace(pattern, replacement);
		}
		if (next === original) {
			continue;
		}
		if (DRY_RUN) {
			console.log(`  ✎ would rewrite ${relative(PACKAGE_ROOT, file)}`);
		} else {
			await writeFile(file, next, "utf8");
			console.log(`  ✎ rewrote ${relative(PACKAGE_ROOT, file)}`);
		}
		touched += 1;
	}
	return touched;
}

async function main() {
	console.log(
		`migrate-shadcn-paths${DRY_RUN ? " (dry run)" : ""}: ${relative(process.cwd(), PACKAGE_ROOT) || "."}`,
	);
	console.log("");
	console.log("Relocating directories:");

	let movedAny = false;
	for (const move of MOVES) {
		const moved = await moveDir(move.from, move.to);
		movedAny ||= moved;
	}

	console.log("");

	if (!movedAny) {
		console.log("Nothing to relocate — all source directories already migrated.");
		console.log("");
	}

	console.log("Rewriting cross-references in src/:");
	const touched = await rewriteImports(SRC);
	if (touched === 0) {
		console.log("  • no references to rewrite");
	}
	console.log("");
	console.log(
		DRY_RUN
			? `Dry run complete. ${touched} file(s) would be updated.`
			: `Done. Updated ${touched} file(s).`,
	);
}

main().catch((err) => {
	console.error("migrate-shadcn-paths: failed");
	console.error(err);
	process.exit(1);
});
