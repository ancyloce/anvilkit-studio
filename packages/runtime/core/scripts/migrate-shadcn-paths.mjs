#!/usr/bin/env node
/**
 * @file `migrate-shadcn-paths` — relocate files installed by the shadcn
 * CLI into the project's primitives tree, then normalize known
 * animate-ui authoring styles that violate this package's lint rules.
 *
 * The shadcn CLI joins each registry item's bare `target` onto the
 * configured `aliases.ui` root, which for animate-ui produces a
 * deeply-nested `components/animate-ui/...` layout plus loose
 * `hooks/` and `lib/` folders directly under `src/`. This package
 * keeps every primitive (and its co-located helpers) under
 * `src/studio/primitives/`, so each install needs a follow-up
 * move + import rewrite + style normalization.
 *
 * The script runs in three phases:
 *   1. Relocate the shadcn install directories into `primitives/`.
 *      Each move is a recursive file-level merge: every file under
 *      the source root is renamed into the matching path under the
 *      destination, creating parents as needed and overwriting any
 *      pre-existing file (the freshly installed shadcn copy is the
 *      authoritative version we want to normalize). The source root
 *      is removed once empty. This lets `shadcn add` be run
 *      incrementally — each invocation drops a few new components
 *      into the same staging dirs, and this script merges them in
 *      without disturbing primitives already migrated by prior runs.
 *   2. Rewrite cross-references from `@/studio/{hooks,lib}/` to
 *      `@/primitives/{hooks,lib}/`.
 *   3. Normalize animate-ui upstream style — translate eslint-disable
 *      pragmas to `// biome-ignore` (biome doesn't honor eslint
 *      suppressions), mark known type-only imports under
 *      `verbatimModuleSyntax: true`, and silence specific lint hits
 *      that animate-ui ships unsuppressed.
 *
 * Every transform is idempotent: missing source directories are
 * skipped, and each regex's replacement no longer matches its own
 * pattern, so re-runs are safe.
 *
 * Usage:
 *   pnpm --filter @anvilkit/core migrate:shadcn-paths
 *   pnpm --filter @anvilkit/core migrate:shadcn-paths -- --dry-run
 */

import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	rmdir,
	stat,
	writeFile,
} from "node:fs/promises";
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
	{ from: "components/animate-ui", to: "studio/primitives/vendor/animate-ui" },
	{ from: "hooks", to: "studio/primitives/hooks" },
	{ from: "lib", to: "studio/primitives/vendor/lib" },
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

/**
 * animate-ui style normalizations applied across `src/` after the
 * import rewrites. Each entry: `[regex, replacement, label]`.
 *
 * Categories:
 *
 *   1. **eslint → biome translation.** animate-ui upstream suppresses
 *      lint hits with `// eslint-disable-next-line ...` comments that
 *      biome doesn't honor. We rewrite those exact lines to the
 *      equivalent `// biome-ignore lint/<rule>: animate-ui upstream`
 *      pragma so the same suppression intent carries over.
 *
 *   2. **`verbatimModuleSyntax` type-only imports.** This package
 *      ships with `verbatimModuleSyntax: true`, but animate-ui mixes
 *      values and types in a single import. We mark the known
 *      offenders (`WithAsChild`) as type-only.
 *
 *   3. **Un-suppressed lint hits.** A few violations ship without an
 *      eslint pragma (e.g. `key={index}` inside `Highlight`). We
 *      inject a targeted `// biome-ignore` line above the offending
 *      JSX with matching indentation.
 *
 * Each replacement is structured so it cannot match its own output —
 * re-running the script after a fresh `shadcn add` is safe.
 */
const ANIMATE_UI_NORMALIZATIONS = [
	// 1. eslint pragmas → biome-ignore equivalents.
	[
		/^([\t ]*)\/\/ eslint-disable-next-line @typescript-eslint\/no-explicit-any\s*$/gm,
		"$1// biome-ignore lint/suspicious/noExplicitAny: animate-ui upstream",
		"eslint(no-explicit-any) → biome-ignore",
	],
	[
		/^([\t ]*)\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\s*$/gm,
		"$1// biome-ignore lint/correctness/useExhaustiveDependencies: animate-ui upstream uses caller-provided deps array",
		"eslint(exhaustive-deps) → biome-ignore",
	],
	// 2. WithAsChild value/type split for `verbatimModuleSyntax`.
	[
		/import\s*\{\s*Slot,\s*WithAsChild\s*\}\s*from\s*(['"])@\/primitives\/animate-ui\/primitives\/animate\/slot\1/g,
		"import { Slot, type WithAsChild } from $1@/primitives/vendor/animate-ui/primitives/animate/slot$1",
		"WithAsChild → type-only import",
	],
	// 3. Un-suppressed `noArrayIndexKey` inside Highlight's
	//    `React.Children.map`. Anchored to the upstream code shape so
	//    we don't touch any other `key={index}` site.
	[
		/(React\.Children\.map\(children, \(child, index\) => \(\n)([\t ]+)(<HighlightItem key=\{index\})/g,
		"$1$2// biome-ignore lint/suspicious/noArrayIndexKey: animate-ui upstream uses index as the highlight item key\n$2$3",
		"HighlightItem key={index} → biome-ignore",
	],
];

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch (err) {
		if (
			err &&
			typeof err === "object" &&
			"code" in err &&
			err.code === "ENOENT"
		) {
			return false;
		}
		throw err;
	}
}

async function* walkAllFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") {
				continue;
			}
			yield* walkAllFiles(full);
			continue;
		}
		if (entry.isFile()) {
			yield full;
		}
	}
}

async function* walkSourceFiles(dir) {
	for await (const full of walkAllFiles(dir)) {
		if (full.endsWith(".ts") || full.endsWith(".tsx")) {
			yield full;
		}
	}
}

/**
 * Recursively merge `src/<from>` into `src/<to>`. Each file is renamed
 * into the matching path under the destination, creating parents as
 * needed and overwriting any pre-existing destination file — the
 * source side is the freshly installed shadcn copy, which is what we
 * want to normalize. The source root is removed once drained.
 *
 * Returns `true` when at least one file was relocated, so the caller
 * can decide whether subsequent passes (import rewrites, style
 * normalization) have anything new to chew on.
 */
async function moveDir(from, to) {
	const fromAbs = join(SRC, from);
	const toAbs = join(SRC, to);
	const label = `${from} → ${to}`;

	if (!(await exists(fromAbs))) {
		console.log(`  • skip ${label} (source not present)`);
		return false;
	}

	const sources = [];
	for await (const filePath of walkAllFiles(fromAbs)) {
		sources.push(filePath);
	}

	if (sources.length === 0) {
		if (DRY_RUN) {
			console.log(`  ✓ would remove empty source src/${from}`);
		} else {
			await rm(fromAbs, { recursive: true, force: true });
			console.log(`  ✓ removed empty source src/${from}`);
		}
		return false;
	}

	let moved = 0;
	let overwritten = 0;
	for (const filePath of sources) {
		const rel = relative(fromAbs, filePath);
		const destPath = join(toAbs, rel);
		const willOverwrite = await exists(destPath);
		if (DRY_RUN) {
			console.log(
				`  ✓ would move src/${from}/${rel} → src/${to}/${rel}${
					willOverwrite ? " (overwrite)" : ""
				}`,
			);
		} else {
			await mkdir(dirname(destPath), { recursive: true });
			await rename(filePath, destPath);
		}
		moved += 1;
		if (willOverwrite) {
			overwritten += 1;
		}
	}

	if (!DRY_RUN) {
		await rm(fromAbs, { recursive: true, force: true });
		// Walk up and remove any source parents that are now empty
		// (e.g. `src/components/` left behind after `animate-ui/`
		// moved out). Stop at SRC so we never touch the src root.
		let parent = dirname(fromAbs);
		while (parent !== SRC && parent.startsWith(`${SRC}/`)) {
			const entries = await readdir(parent);
			if (entries.length > 0) {
				break;
			}
			await rmdir(parent);
			parent = dirname(parent);
		}
	}
	const verb = DRY_RUN ? "would merge" : "merged";
	const suffix = overwritten > 0 ? ` (${overwritten} overwritten)` : "";
	console.log(`  ✓ ${verb} ${moved} file(s) ${label}${suffix}`);
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

async function normalizeAnimateUiStyle(rootDir) {
	let touched = 0;
	for await (const file of walkSourceFiles(rootDir)) {
		const original = await readFile(file, "utf8");
		let next = original;
		const labels = [];
		for (const [pattern, replacement, label] of ANIMATE_UI_NORMALIZATIONS) {
			const before = next;
			next = next.replace(pattern, replacement);
			if (next !== before) {
				labels.push(label);
			}
		}
		if (next === original) {
			continue;
		}
		const detail = `${relative(PACKAGE_ROOT, file)} (${labels.join(", ")})`;
		if (DRY_RUN) {
			console.log(`  ✎ would normalize ${detail}`);
		} else {
			await writeFile(file, next, "utf8");
			console.log(`  ✎ normalized ${detail}`);
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
		console.log(
			"Nothing to relocate — all source directories already migrated.",
		);
		console.log("");
	}

	console.log("Rewriting cross-references in src/:");
	const importsTouched = await rewriteImports(SRC);
	if (importsTouched === 0) {
		console.log("  • no references to rewrite");
	}
	console.log("");

	console.log("Normalizing animate-ui upstream style in src/:");
	const styleTouched = await normalizeAnimateUiStyle(SRC);
	if (styleTouched === 0) {
		console.log("  • nothing to normalize");
	}
	console.log("");

	const total = importsTouched + styleTouched;
	console.log(
		DRY_RUN
			? `Dry run complete. ${total} file edit(s) would occur (${importsTouched} import, ${styleTouched} style).`
			: `Done. ${total} file edit(s) applied (${importsTouched} import, ${styleTouched} style).`,
	);
}

main().catch((err) => {
	console.error("migrate-shadcn-paths: failed");
	console.error(err);
	process.exit(1);
});
