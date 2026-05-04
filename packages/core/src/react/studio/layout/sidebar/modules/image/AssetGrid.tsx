/**
 * @file Routes a list of {@link StudioAsset}s to the correct per-kind
 * tile component. Layout switches by kind:
 *
 * - images: 3-column square grid
 * - videos: 16:9 cards stacked
 * - audio: row list
 *
 * When the active filter is `"all"`, all three sections render in
 * order; with a specific filter, only the matching kind renders.
 */

import { type ReactNode } from "react";

import type {
  StudioAsset,
  StudioAssetAction,
  StudioAssetSource,
} from "../../../../../../types/sidebar";
import { Skeleton } from "../../../../primitives/skeleton";
import type { AssetCategoryFilter } from "../../../../state/editor-ui-store";
import { useMsg } from "../../../../state/editor-i18n-store";
import { AssetAudioRow } from "./AssetAudioRow";
import { AssetImageTile } from "./AssetImageTile";
import { AssetOverflowMenu } from "./AssetOverflowMenu";
import { AssetVideoCard } from "./AssetVideoCard";

export interface UploadingTile {
	readonly id: string;
	readonly name: string;
	readonly progress: number;
}

export interface AssetGridProps {
	readonly assets: readonly StudioAsset[];
	readonly uploadingTiles: readonly UploadingTile[];
	readonly filter: AssetCategoryFilter;
	readonly source: StudioAssetSource;
	readonly pluginActions: readonly StudioAssetAction[];
	readonly onAssetClick: (asset: StudioAsset) => void;
	readonly onRename: (asset: StudioAsset) => void;
	readonly onReplace: (asset: StudioAsset) => void;
}

export function AssetGrid({
	assets,
	uploadingTiles,
	filter,
	source,
	pluginActions,
	onAssetClick,
	onRename,
	onReplace,
}: AssetGridProps): ReactNode {
	const msg = useMsg();
	const showImages = filter === "all" || filter === "images";
	const showVideos = filter === "all" || filter === "videos";
	const showAudio = filter === "all" || filter === "audio";

	const images = showImages
		? assets.filter((asset) => asset.kind === "image" || asset.kind === "other")
		: [];
	const videos = showVideos
		? assets.filter((asset) => asset.kind === "video")
		: [];
	const audio = showAudio
		? assets.filter((asset) => asset.kind === "audio")
		: [];

	const renderMenu = (asset: StudioAsset): ReactNode => (
		<AssetOverflowMenu
			asset={asset}
			source={source}
			pluginActions={pluginActions}
			onRename={onRename}
			onReplace={onReplace}
		/>
	);

	const sections: ReactNode[] = [];

	if (showImages && (images.length > 0 || uploadingTiles.length > 0)) {
		sections.push(
			<div
				key="images"
				className="grid grid-cols-3 gap-2 p-2"
				data-testid="ak-image-section-images"
			>
				{uploadingTiles.map((tile) => (
					<div
						key={`uploading-${tile.id}`}
						className="flex flex-col gap-1"
						data-testid={`ak-image-uploading-${tile.id}`}
						aria-live="polite"
					>
						<Skeleton className="aspect-square w-full" />
						<div className="h-1 w-full overflow-hidden rounded-full bg-[var(--ak-studio-muted)]">
							<div
								className="h-full bg-[var(--ak-studio-accent)] transition-[width]"
								style={{ width: `${Math.round(tile.progress * 100)}%` }}
							/>
						</div>
						<p className="truncate text-xs text-[var(--ak-studio-muted-fg)]">
							{msg("studio.module.image.upload.progress")}
						</p>
					</div>
				))}
				{images.map((asset) => (
					<AssetImageTile
						key={asset.id}
						asset={asset}
						onClick={() => onAssetClick(asset)}
						menu={renderMenu(asset)}
					/>
				))}
			</div>,
		);
	}

	if (showVideos && videos.length > 0) {
		sections.push(
			<div
				key="videos"
				className="flex flex-col gap-2 p-2"
				data-testid="ak-image-section-videos"
			>
				{videos.map((asset) => (
					<AssetVideoCard
						key={asset.id}
						asset={asset}
						onClick={() => onAssetClick(asset)}
						menu={renderMenu(asset)}
					/>
				))}
			</div>,
		);
	}

	if (showAudio && audio.length > 0) {
		sections.push(
			<div
				key="audio"
				className="flex flex-col gap-1 p-2"
				data-testid="ak-image-section-audio"
			>
				{audio.map((asset) => (
					<AssetAudioRow
						key={asset.id}
						asset={asset}
						onClick={() => onAssetClick(asset)}
						menu={renderMenu(asset)}
					/>
				))}
			</div>,
		);
	}

	return <>{sections}</>;
}
