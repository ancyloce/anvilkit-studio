import type { PageIRAsset, PageIRNode } from "@anvilkit/core/types";
import { deriveAssetId } from "./internal/derive-asset-id.js";

/**
 * Options for {@link collectAssets}.
 */
export interface CollectAssetsOptions {
	/**
	 * Custom id derivation function. Defaults to the internal FNV-1a
	 * hash. Override in tests for deterministic snapshot ids.
	 */
	deriveId?: (url: string) => string;
}

// ---------------------------------------------------------------------------
// Extension → kind mapping
// ---------------------------------------------------------------------------
const IMAGE_EXTS = /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i;
const VIDEO_EXTS = /\.(mp4|webm)(\?|$)/i;
const FONT_EXTS = /\.(woff2?|ttf|otf|eot)(\?|$)/i;
const SCRIPT_EXTS = /\.js(\?|$)/i;
const STYLE_EXTS = /\.css(\?|$)/i;

function classifyUrl(url: string): PageIRAsset["kind"] {
	if (IMAGE_EXTS.test(url)) return "image";
	if (VIDEO_EXTS.test(url)) return "video";
	if (FONT_EXTS.test(url)) return "font";
	if (SCRIPT_EXTS.test(url)) return "script";
	if (STYLE_EXTS.test(url)) return "style";
	return "other";
}

// ---------------------------------------------------------------------------
// URL-bearing prop key patterns
// ---------------------------------------------------------------------------

/**
 * Prop keys that are treated as asset references. Values at these
 * keys must be strings to be collected — non-string values are
 * silently skipped (defensive; the validator package handles typing).
 *
 * `href` is intentionally excluded — it is a navigation link, not an
 * asset reference.
 */
const ASSET_KEY_PATTERN =
	/^(src|imageUrl|imageSrc|url|videoUrl|videoSrc|fontUrl|scriptUrl|styleUrl)$/;

// ---------------------------------------------------------------------------
// Recursive walker
// ---------------------------------------------------------------------------

function walkValue(
	value: unknown,
	seen: Map<string, PageIRAsset>,
	derive: (url: string) => string,
): void {
	if (value === null || value === undefined) return;

	if (Array.isArray(value)) {
		for (const item of value) {
			walkValue(item, seen, derive);
		}
		return;
	}

	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const [key, val] of Object.entries(obj)) {
			// Check if this key matches an asset pattern
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
			// Recurse into nested objects/arrays
			walkValue(val, seen, derive);
		}
	}
}

/**
 * Walk a node's props and collect every asset reference into a
 * deduplicated, deterministically-ordered list.
 *
 * Used by `puckDataToIR` to populate the root
 * {@link PageIR.assets} manifest, and by node-scoped exporters
 * that want to resolve only their own slice of the asset graph.
 *
 * **Does not fetch or read files** — asset collection is purely
 * static analysis of prop values.
 *
 * @param node - The node (or Puck content item) to walk.
 * @param opts - See {@link CollectAssetsOptions}.
 * @returns A deduplicated list of assets, ordered by first encounter.
 */
export function collectAssets(
	node: PageIRNode | { props: Record<string, unknown> },
	opts?: CollectAssetsOptions,
): readonly PageIRAsset[] {
	const derive = opts?.deriveId ?? deriveAssetId;
	const seen = new Map<string, PageIRAsset>();

	// Walk this node's props
	walkValue(node.props, seen, derive);

	// Walk children recursively if present
	if ("children" in node && Array.isArray(node.children)) {
		for (const child of node.children) {
			walkValue(child.props, seen, derive);
		}
	}

	return [...seen.values()];
}
