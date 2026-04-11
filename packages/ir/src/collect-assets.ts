import type { PageIRAsset, PageIRNode } from "@anvilkit/core/types";

/**
 * Walk a {@link PageIRNode} sub-tree and collect every asset
 * reference into a deduplicated, deterministically-ordered list.
 *
 * Used by `puckDataToIR` to populate the root
 * {@link import("@anvilkit/core/types").PageIR.assets | PageIR.assets}
 * manifest, and by node-scoped exporters that want to resolve only
 * their own slice of the asset graph.
 *
 * **Stubbed in `phase3-002`.** Real implementation lands in
 * `phase3-004`.
 *
 * @param _node - The sub-tree root to walk.
 * @returns A deduplicated list of assets referenced inside `_node`.
 * @throws {Error} Always — the real helper lands in `phase3-004`.
 */
export function collectAssets(_node: PageIRNode): readonly PageIRAsset[] {
	throw new Error(
		"[@anvilkit/ir] collectAssets is not implemented yet — see phase3-004.",
	);
}
