import type { PageIRAsset, PageIRNode } from "@anvilkit/contracts";
import { walkNodeIntoMap } from "./internal/asset-walker.js";
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

/**
 * Walk a node's props and collect every asset reference into a
 * deduplicated, deterministically-ordered list.
 *
 * Used by `puckDataToIR` to populate the root IR document's
 * `assets` manifest, and by node-scoped exporters that want to
 * resolve only their own slice of the asset graph.
 *
 * **Does not fetch or read files** — asset collection is purely
 * static analysis of prop values.
 *
 * @param node - The node (or Puck content item) to walk.
 * @param opts - Optional collection options (currently a `deriveId`
 *   callback override).
 * @returns A deduplicated list of assets, ordered by first encounter.
 */
export function collectAssets(
	node: PageIRNode | { props: Record<string, unknown> },
	opts?: CollectAssetsOptions,
): readonly PageIRAsset[] {
	const derive = opts?.deriveId ?? deriveAssetId;
	const seen = new Map<string, PageIRAsset>();

	walkNodeIntoMap(node, seen, derive, 0);

	return [...seen.values()];
}
