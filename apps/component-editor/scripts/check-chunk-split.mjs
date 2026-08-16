#!/usr/bin/env node
/**
 * P0-17 (plan 0036 / FR-C10) — the editor route must not carry the
 * CodeMirror chunk before the code panel is opened.
 *
 * A package-level size budget is NOT enough on its own: the known escape in
 * this repo is that a *shared* chunk can pull a dependency into a route
 * while every per-package budget still passes. So this checks the built
 * artifacts directly — which chunks the editor route actually references —
 * rather than trusting `size-limit`.
 *
 * Usage: pnpm --filter component-editor build && node scripts/check-chunk-split.mjs
 * Exit 0 clean · 1 violation · 2 nothing to check (build missing).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const NEXT_DIR = ".next";
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");
/** Route whose initial payload must stay CodeMirror-free. */
const ROUTE_MANIFEST = join(
	NEXT_DIR,
	"server",
	"app",
	"editor",
	"[pageId]",
	"page_client-reference-manifest.js",
);
/** Markers that only appear in bundled CodeMirror code. */
const MARKERS = [/@codemirror/, /\bcmView\b/, /class EditorView\b/];

if (!existsSync(CHUNKS_DIR) || !existsSync(ROUTE_MANIFEST)) {
	console.error(
		"check-chunk-split: no production build found — run `pnpm build` first.",
	);
	process.exit(2);
}

const codeMirrorChunks = readdirSync(CHUNKS_DIR)
	.filter((file) => file.endsWith(".js"))
	.filter((file) => {
		const source = readFileSync(join(CHUNKS_DIR, file), "utf8");
		return MARKERS.some((marker) => marker.test(source));
	});

if (codeMirrorChunks.length === 0) {
	console.error(
		"check-chunk-split: no CodeMirror chunk in the build at all — the code panel would never load. Check the dynamic import in CodeMirrorSurface.",
	);
	process.exit(1);
}

const manifest = readFileSync(ROUTE_MANIFEST, "utf8");
const leaked = codeMirrorChunks.filter((chunk) => manifest.includes(chunk));

if (leaked.length > 0) {
	console.error(
		`check-chunk-split: the editor route references ${leaked.length} CodeMirror chunk(s) before the panel opens:\n  ${leaked.join("\n  ")}\n` +
			"The lazy import was defeated — check for a static import of editor-binding (or of @codemirror/*) reaching the route.",
	);
	process.exit(1);
}

console.log(
	`check-chunk-split: OK — ${codeMirrorChunks.length} CodeMirror chunk(s) exist and the editor route references none of them.`,
);
