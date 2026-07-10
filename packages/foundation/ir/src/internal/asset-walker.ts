/**
 * Shared asset-walker primitives — the prop-tree traversal that
 * powers both the public {@link import("../collect-assets.js").collectAssets | collectAssets}
 * and the single-pass collector inside `puckDataToIR`.
 *
 * Kept under `internal/` (and out of any `package.json#exports`
 * subpath) so the public surface of `@anvilkit/ir/collect-assets`
 * stays exactly the documented `collectAssets` function.
 *
 * @internal
 */

import type { PageIRAsset, PageIRNode } from "@anvilkit/contracts";
import { MAX_TREE_DEPTH } from "./types.js";

// ---------------------------------------------------------------------------
// Extension → kind mapping
// ---------------------------------------------------------------------------
const IMAGE_EXTS = /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i;
const VIDEO_EXTS = /\.(mp4|webm)(\?|$)/i;
const FONT_EXTS = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const SCRIPT_EXTS = /\.js(\?|$)/i;
const STYLE_EXTS = /\.css(\?|$)/i;

export function classifyUrl(url: string): PageIRAsset["kind"] {
	if (IMAGE_EXTS.test(url)) return "image";
	if (VIDEO_EXTS.test(url)) return "video";
	if (FONT_EXTS.test(url)) return "font";
	if (SCRIPT_EXTS.test(url)) return "script";
	if (STYLE_EXTS.test(url)) return "style";
	return "other";
}

/**
 * Prop keys that are treated as asset references. Values at these
 * keys must be strings to be collected — non-string values are
 * silently skipped (defensive; the validator package handles typing).
 *
 * `href` is intentionally excluded — it is a navigation link, not an
 * asset reference.
 */
export const ASSET_KEY_PATTERN =
	/^(src|imageUrl|imageSrc|url|videoUrl|videoSrc|fontUrl|scriptUrl|styleUrl|backgroundSrc|backgroundImage|poster|thumbnailSrc)$/;

/**
 * Walk a prop value tree (object/array), pushing every asset hit
 * into `seen` (first-encounter wins). Recursion is bounded by
 * `MAX_TREE_DEPTH`; the cap is silent — callers without an
 * `onWarning` channel accept truncation as the safe fallback.
 */
export function walkValueIntoMap(
	value: unknown,
	seen: Map<string, PageIRAsset>,
	derive: (url: string) => string,
	depth: number,
): void {
	if (value === null || value === undefined) return;
	if (depth > MAX_TREE_DEPTH) return;

	if (Array.isArray(value)) {
		for (const item of value) {
			walkValueIntoMap(item, seen, derive, depth + 1);
		}
		return;
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const [key, val] of Object.entries(obj)) {
			if (
				ASSET_KEY_PATTERN.test(key) &&
				typeof val === "string" &&
				val !== ""
			) {
				if (!seen.has(val)) {
					seen.set(val, {
						id: derive(val),
						kind: classifyUrl(val),
						url: val,
					});
				}
			}
			walkValueIntoMap(val, seen, derive, depth + 1);
		}
	}
}

/**
 * Whole-subtree walker: own props first, then each child subtree
 * in order (pre-order DFS). Used by the public `collectAssets`.
 */
export function walkNodeIntoMap(
	node: PageIRNode | { props: Record<string, unknown> },
	seen: Map<string, PageIRAsset>,
	derive: (url: string) => string,
	depth: number,
): void {
	if (depth > MAX_TREE_DEPTH) return;

	walkValueIntoMap(node.props, seen, derive, 0);

	if ("children" in node && Array.isArray(node.children)) {
		for (const child of node.children) {
			walkNodeIntoMap(child, seen, derive, depth + 1);
		}
	}
}

/**
 * Collect asset references from a single node's **own props only**
 * (no descent into child nodes). Order matches a pre-order walk of
 * the prop value tree, so callers can build a whole-tree manifest
 * by unioning this with child results in child order.
 */
export function collectNodeOwnAssets(
	props: Record<string, unknown>,
	derive: (url: string) => string,
): PageIRAsset[] {
	const seen = new Map<string, PageIRAsset>();
	walkValueIntoMap(props, seen, derive, 0);
	return [...seen.values()];
}
