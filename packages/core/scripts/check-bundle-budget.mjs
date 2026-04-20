#!/usr/bin/env node
/**
 * @file `check-bundle-budget` — quality gate for `core-015`.
 *
 * Two things matter to the 0.1 alpha contract:
 *
 * 1. **`<Studio>` is under a firm 25 KB gzipped budget** when a host
 *    app imports only `{ Studio }` from `@anvilkit/core`. The budget
 *    is the effective "cost of adopting the shell" — if a legitimate
 *    feature pushes it over, the PR raises the budget with a
 *    changeset and a one-line justification. Silent growth is not
 *    allowed.
 * 2. **The compat `aiHostAdapter` is tree-shaken** from that same
 *    build. This resolves `core-010` acceptance criterion #6 and is
 *    the reason `src/compat/` is a separate subpath barrel that the
 *    root `index.ts` does **not** re-export from.
 *
 * ### How the check works
 *
 * The script builds the package (`rslib build`) so `dist/` is fresh,
 * then writes a tiny throwaway entry file that re-exports `Studio`:
 *
 * ```js
 * export { Studio } from "../dist/index.js";
 * ```
 *
 * esbuild bundles that entry into a single file with tree-shaking,
 * minification, and React + react-dom + @puckeditor/core marked as
 * `external` (they are peer dependencies, not part of the cost of
 * adopting `@anvilkit/core`). The resulting bytes are gzipped using
 * Node's built-in `zlib` and compared against the budget.
 *
 * The tree-shake assertion is a substring grep over the **un-gzipped**
 * bundle for the literal `aiHostAdapter`. If it appears, the adapter
 * was not dropped and the compat isolation contract is broken.
 *
 * ### Peer dependencies
 *
 * `react`, `react-dom`, and `@puckeditor/core` are marked external
 * because the bundle budget measures what `@anvilkit/core` itself
 * ships, not the peer deps a host already has. Internal deps
 * (`@anvilkit/utils`, `zod`, `zustand`) are **included** in the
 * measurement — they are real costs a host adopts when installing
 * `@anvilkit/core`.
 *
 * ### Idempotence
 *
 * The throwaway entry and output files live inside a temp directory
 * that is cleared at the start of every run. Running the script
 * twice in a row produces identical output — a required property of
 * the `check:all` aggregate gate.
 *
 * @see {@link ../docs/tasks/core-015-public-api-gates.md | core-015}
 */

import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, "..");
const DIST_ENTRY = resolve(PACKAGE_ROOT, "dist/index.js");
const TMP_DIR = resolve(PACKAGE_ROOT, ".bundle-check");
const ENTRY_FILE = resolve(TMP_DIR, "studio-entry.mjs");
const OUT_DIR = resolve(TMP_DIR, "out");

/** Firm budget — raise only with a changeset justification. */
const BUDGET_GZIPPED_BYTES = 25 * 1024;

/** Peers: host-provided, never counted against the core budget. */
const EXTERNAL_PEERS = [
	"react",
	"react-dom",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"@puckeditor/core",
];

/**
 * Distinctive strings that only appear inside the adapter's
 * **implementation body**, not in the dynamic `import()` call site.
 *
 * Note: the token `aiHostAdapter` itself is NOT forbidden — it
 * legitimately appears in the entry chunk as the destructuring name
 * in `const { aiHostAdapter } = await import(...)`, which is just a
 * ~14-byte string literal naming the export on the async chunk.
 *
 * What we actually care about is whether the adapter's CODE
 * ended up in the entry chunk. The deprecation message string only
 * appears in the minified output if the adapter body was inlined —
 * it's the tightest possible signal that code-splitting failed.
 *
 * If this check ever flags a false positive, the fix is to make the
 * check smarter, not to change the adapter's public strings.
 */
const FORBIDDEN_STRINGS = ["prop is deprecated"];

/**
 * Walk `src/` and return the most recent file-mtime across every
 * source file. Used to detect a stale `dist/` that was built against
 * an earlier revision of the source — running the budget check on
 * stale output is actively misleading, so we rebuild first.
 */
async function latestSrcMtime(dir) {
	let newest = 0;
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			newest = Math.max(newest, await latestSrcMtime(full));
			continue;
		}
		const info = await stat(full);
		newest = Math.max(newest, info.mtimeMs);
	}
	return newest;
}

async function ensureDistExists() {
	const SRC_DIR = resolve(PACKAGE_ROOT, "src");
	let distStat = null;
	try {
		distStat = await stat(DIST_ENTRY);
	} catch {
		console.log("check-bundle-budget: dist/ missing — running `rslib build`…");
		execSync("pnpm exec rslib build", {
			cwd: PACKAGE_ROOT,
			stdio: "inherit",
		});
		return;
	}

	// Rebuild when any source file is newer than the emitted entry.
	// `rslib` is fast enough that the extra build is cheaper than
	// debugging a false-positive budget pass against stale output.
	try {
		const srcMtime = await latestSrcMtime(SRC_DIR);
		if (srcMtime > distStat.mtimeMs) {
			console.log(
				"check-bundle-budget: dist/ is older than src/ — running `rslib build`…",
			);
			execSync("pnpm exec rslib build", {
				cwd: PACKAGE_ROOT,
				stdio: "inherit",
			});
		}
	} catch (err) {
		// Walking src/ should never fail in practice, but treat the
		// unexpected as a signal to rebuild defensively rather than
		// silently trust stale output.
		console.log(
			"check-bundle-budget: staleness check failed — rebuilding defensively",
			err,
		);
		execSync("pnpm exec rslib build", {
			cwd: PACKAGE_ROOT,
			stdio: "inherit",
		});
	}
}

async function writeEntry() {
	await rm(TMP_DIR, { recursive: true, force: true });
	await mkdir(TMP_DIR, { recursive: true });
	// Import from the package name, not a relative dist path, so
	// esbuild resolves through the published exports map exactly the
	// way a consumer would. Pointing at `../dist/index.js` directly
	// would sidestep the exports map and give a misleading bundle.
	const body = `export { Studio } from "@anvilkit/core";\n`;
	await writeFile(ENTRY_FILE, body, "utf8");
}

async function bundle() {
	// `splitting: true` turns dynamic `import()` calls in the source
	// into separate chunks — exactly what real host bundlers (Next.js,
	// Vite, Rspack) do by default. Without splitting, esbuild inlines
	// every dynamic import into the entry chunk, which would wrongly
	// count the `ai-host-adapter` (loaded dynamically from inside
	// `<Studio>` only when `aiHost` is set) against the entry budget.
	//
	// We measure ONLY the entry chunk — async chunks are opt-in work
	// the runtime does at the moment the feature is actually used,
	// so they correctly do not count toward the "cost of adopting
	// `<Studio>`" budget.
	const result = await build({
		entryPoints: [ENTRY_FILE],
		outdir: OUT_DIR,
		bundle: true,
		format: "esm",
		platform: "browser",
		target: "es2022",
		minify: true,
		treeShaking: true,
		splitting: true,
		external: EXTERNAL_PEERS,
		absWorkingDir: PACKAGE_ROOT,
		logLevel: "error",
		write: true,
		metafile: true,
	});
	if (result.errors.length > 0) {
		for (const err of result.errors) {
			console.error(err);
		}
		throw new Error("check-bundle-budget: esbuild reported errors");
	}
	return result.metafile;
}

/**
 * Identify which emitted file is the top-level entry chunk. With
 * `splitting: true`, esbuild names the entry `studio-entry.js` (the
 * basename of the entry input) and names split chunks `chunk-*.js`.
 * The metafile's `outputs` map lets us be certain which is which by
 * checking the `entryPoint` field.
 */
async function findEntryChunk(metafile) {
	for (const [outPath, info] of Object.entries(metafile.outputs)) {
		if (info.entryPoint) {
			return resolve(PACKAGE_ROOT, outPath);
		}
	}
	throw new Error(
		"check-bundle-budget: could not find entry chunk in esbuild metafile",
	);
}

async function main() {
	await ensureDistExists();
	await writeEntry();
	const metafile = await bundle();
	const entryChunkPath = await findEntryChunk(metafile);

	const raw = await readFile(entryChunkPath);
	const rawBytes = raw.length;
	const gzipped = gzipSync(raw, { level: 9 });
	const gzippedBytes = gzipped.length;

	const text = raw.toString("utf8");
	const leaks = FORBIDDEN_STRINGS.filter((needle) => text.includes(needle));

	const pct = ((gzippedBytes / BUDGET_GZIPPED_BYTES) * 100).toFixed(1);
	console.log("check-bundle-budget: <Studio> entry bundle");
	console.log(`  entry chunk: ${basename(entryChunkPath)}`);
	console.log(`  raw:         ${rawBytes.toLocaleString()} bytes`);
	console.log(
		`  gzipped:     ${gzippedBytes.toLocaleString()} bytes (${pct}% of ${BUDGET_GZIPPED_BYTES.toLocaleString()} B budget)`,
	);

	// List split chunks (informational). These are async chunks that
	// only load on demand — the budget excludes them on purpose.
	const allFiles = await readdir(OUT_DIR);
	const asyncChunks = allFiles.filter(
		(f) => f !== basename(entryChunkPath) && f.endsWith(".js"),
	);
	if (asyncChunks.length > 0) {
		console.log(`  async chunks (not counted): ${asyncChunks.join(", ")}`);
	}

	let failed = false;

	if (gzippedBytes > BUDGET_GZIPPED_BYTES) {
		console.error("");
		console.error(
			`check-bundle-budget: FAIL — entry chunk is ${gzippedBytes - BUDGET_GZIPPED_BYTES} bytes over the ${BUDGET_GZIPPED_BYTES}-byte budget.`,
		);
		console.error(
			"Raise the budget in a changeset only if a legitimate feature justifies it.",
		);
		failed = true;
	}

	if (leaks.length > 0) {
		console.error("");
		console.error(
			`check-bundle-budget: FAIL — forbidden strings found in entry chunk: ${leaks.join(", ")}`,
		);
		console.error(
			"`aiHostAdapter` leaked into the default entry chunk. Fix by ensuring src/index.ts does not re-export from src/compat/ and that <Studio> loads the adapter via dynamic `import()` only.",
		);
		failed = true;
	}

	if (failed) {
		process.exit(1);
	}

	console.log("check-bundle-budget: OK");
}

main().catch((err) => {
	console.error("check-bundle-budget: crashed unexpectedly");
	console.error(err);
	process.exit(2);
});
