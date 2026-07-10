/**
 * @file Shared asset-list semantics for the image library (report 0003 P2-7b):
 * the multi-selection modifier type used by the tiles + `AssetGrid`, and the
 * partition/display-order helpers that BOTH `AssetGrid` (to render sections)
 * and `ImageModule` (to compute shift-range selection) consume — so the
 * selection range always matches the order tiles are actually rendered in.
 *
 * Kept in its own leaf module so the three tile components and `AssetGrid` can
 * share it without importing each other.
 */

import type { AssetCategoryFilter } from "@/state/slices/editor-ui-store";
import type { StudioAsset } from "@/types/sidebar";

export interface SelectModifiers {
	readonly shiftKey: boolean;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
}

/** Extract just the selection-relevant modifiers from a click event. */
export function modifiersFromEvent(event: {
	readonly shiftKey: boolean;
	readonly metaKey: boolean;
	readonly ctrlKey: boolean;
}): SelectModifiers {
	return {
		shiftKey: event.shiftKey,
		metaKey: event.metaKey,
		ctrlKey: event.ctrlKey,
	};
}

export interface PartitionedAssets {
	readonly images: readonly StudioAsset[];
	readonly videos: readonly StudioAsset[];
	readonly audio: readonly StudioAsset[];
}

/**
 * Partition assets into the grid's three sections, honoring the active kind
 * filter. "image" and "other" both render in the image grid. Single pass.
 */
export function partitionAssets(
	assets: readonly StudioAsset[],
	filter: AssetCategoryFilter,
): PartitionedAssets {
	const images: StudioAsset[] = [];
	const videos: StudioAsset[] = [];
	const audio: StudioAsset[] = [];
	const wantImages = filter === "all" || filter === "images";
	const wantVideos = filter === "all" || filter === "videos";
	const wantAudio = filter === "all" || filter === "audio";
	for (const asset of assets) {
		if (asset.kind === "video") {
			if (wantVideos) videos.push(asset);
		} else if (asset.kind === "audio") {
			if (wantAudio) audio.push(asset);
		} else if (wantImages) {
			images.push(asset);
		}
	}
	return { images, videos, audio };
}

/**
 * Assets in the exact order the grid renders them — images/other, then videos,
 * then audio — so a shift-range over this list matches the visible layout. Used
 * for selection ranges and to scope the selection to displayed tiles.
 */
export function assetsInDisplayOrder(
	assets: readonly StudioAsset[],
	filter: AssetCategoryFilter,
): readonly StudioAsset[] {
	const { images, videos, audio } = partitionAssets(assets, filter);
	return [...images, ...videos, ...audio];
}
