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

import { type ReactNode, useCallback, useMemo } from "react";
import { Skeleton } from "@/primitives/skeleton";
import { Windowed } from "@/primitives/windowed";
import { useMsg } from "@/state/editor-i18n-context";
import type { AssetCategoryFilter } from "@/state/slices/editor-ui-store";
import type {
	StudioAsset,
	StudioAssetAction,
	StudioAssetSource,
} from "@/types/sidebar";
import { AssetAudioRow } from "./AssetAudioRow";
import { AssetImageTile } from "./AssetImageTile";
import { AssetOverflowMenu } from "./AssetOverflowMenu";
import { AssetVideoCard } from "./AssetVideoCard";

/** Stable `Windowed.itemKey` — hoisted so it never re-allocates per render. */
const assetKey = (asset: StudioAsset): string => asset.id;

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

	// Single pass partitions assets by kind honoring the active filter,
	// instead of three independent full-list scans every render.
	const { images, videos, audio } = useMemo(() => {
		const img: StudioAsset[] = [];
		const vid: StudioAsset[] = [];
		const aud: StudioAsset[] = [];
		const wantImages = filter === "all" || filter === "images";
		const wantVideos = filter === "all" || filter === "videos";
		const wantAudio = filter === "all" || filter === "audio";
		for (const asset of assets) {
			if (asset.kind === "video") {
				if (wantVideos) vid.push(asset);
			} else if (asset.kind === "audio") {
				if (wantAudio) aud.push(asset);
			} else if (wantImages) {
				// "image" and "other" both render in the image grid.
				img.push(asset);
			}
		}
		return { images: img, videos: vid, audio: aud };
	}, [assets, filter]);

	// Stable across renders so the memoized tiles below can skip re-rendering
	// when only sibling state (e.g. upload progress) changes.
	const renderMenu = useCallback(
		(asset: StudioAsset): ReactNode => (
			<AssetOverflowMenu
				asset={asset}
				source={source}
				pluginActions={pluginActions}
				onRename={onRename}
				onReplace={onReplace}
			/>
		),
		[source, pluginActions, onRename, onReplace],
	);

	// Dragging an external (e.g. Unsplash) result onto the canvas is a "use"
	// of that asset, so fire the source's `pickResult` to run its MANDATORY
	// download trigger (and registration) — mirroring the click path. Local
	// assets need no pick step. Best-effort: a failed trigger must never block
	// the drag.
	const handleAssetDragStart = useCallback(
		(asset: StudioAsset): void => {
			if (
				asset.source !== undefined &&
				asset.source !== "local" &&
				source.pickResult !== undefined
			) {
				void source.pickResult(asset).catch(() => undefined);
			}
		},
		[source],
	);

	// `Windowed.renderItem` must be `useCallback`-stable (see windowed.tsx) —
	// a fresh inline arrow re-renders every windowed row on each parent render
	// and defeats virtualization. `onClick`/`renderMenu` are passed by stable
	// reference so the memoized tiles can bail out of unrelated re-renders.
	const renderImageItem = useCallback(
		(asset: StudioAsset): ReactNode => (
			<AssetImageTile
				asset={asset}
				onClick={onAssetClick}
				onDragStartAsset={handleAssetDragStart}
				renderMenu={renderMenu}
			/>
		),
		[onAssetClick, handleAssetDragStart, renderMenu],
	);

	const renderVideoItem = useCallback(
		(asset: StudioAsset): ReactNode => (
			<AssetVideoCard
				asset={asset}
				onClick={onAssetClick}
				renderMenu={renderMenu}
			/>
		),
		[onAssetClick, renderMenu],
	);

	const renderAudioItem = useCallback(
		(asset: StudioAsset): ReactNode => (
			<AssetAudioRow
				asset={asset}
				onClick={onAssetClick}
				renderMenu={renderMenu}
			/>
		),
		[onAssetClick, renderMenu],
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
				<Windowed
					items={images}
					itemKey={assetKey}
					estimateSize={112}
					lanes={3}
					data-testid="ak-image-section-images-window"
					renderItem={renderImageItem}
				/>
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
				<Windowed
					items={videos}
					itemKey={assetKey}
					estimateSize={140}
					data-testid="ak-image-section-videos-window"
					renderItem={renderVideoItem}
				/>
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
				<Windowed
					items={audio}
					itemKey={assetKey}
					estimateSize={48}
					data-testid="ak-image-section-audio-window"
					renderItem={renderAudioItem}
				/>
			</div>,
		);
	}

	return <>{sections}</>;
}
