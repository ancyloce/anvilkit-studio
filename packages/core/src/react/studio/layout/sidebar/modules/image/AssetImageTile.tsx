/**
 * @file Square 1:1 image tile (PRD §7.2). Lazy-loaded thumbnail with
 * an overflow menu top-right and a filename caption below.
 */

import { type DragEvent, memo, type ReactNode } from "react";
import { encodeDropPayload } from "@/canvas-drop";
import { Button } from "@/primitives/button";
import type { StudioAsset } from "@/types/sidebar";

export interface AssetImageTileProps {
	readonly asset: StudioAsset;
	readonly onClick: (asset: StudioAsset) => void;
	/**
	 * Fired when the tile starts being dragged, so the host can run the
	 * source's pick side effects (e.g. Unsplash's MANDATORY download trigger)
	 * for external assets — the drag bypasses the click path that normally
	 * runs them.
	 */
	readonly onDragStartAsset?: (asset: StudioAsset) => void;
	/**
	 * Builds the per-asset overflow menu. A render-prop (not a prebuilt
	 * `ReactNode`) so the tile can be `memo`'d: the parent passes one stable
	 * callback instead of a fresh element per render, and the menu element is
	 * created inside this tile's own render — only when the tile re-renders.
	 */
	readonly renderMenu: (asset: StudioAsset) => ReactNode;
}

function AssetImageTileImpl({
	asset,
	onClick,
	onDragStartAsset,
	renderMenu,
}: AssetImageTileProps): ReactNode {
	const src = asset.thumbnailUrl ?? asset.url;
	return (
		<div
			className="group relative flex flex-col gap-1 text-xs"
			data-testid={`ak-image-tile-${asset.id}`}
		>
			<Button
				variant="ghost"
				onClick={() => onClick(asset)}
				draggable
				onDragStart={(event: DragEvent<HTMLButtonElement>) => {
					encodeDropPayload(event.dataTransfer, {
						kind: "image",
						url: asset.url,
						alt: asset.name,
					});
					event.dataTransfer.effectAllowed = "copy";
					onDragStartAsset?.(asset);
				}}
				className="relative aspect-square h-auto w-full overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-muted)] p-0 transition-colors hover:border-[var(--ak-studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]"
				aria-label={asset.name}
			>
				<img
					src={src}
					alt=""
					loading="lazy"
					decoding="async"
					className="size-full object-cover"
				/>
			</Button>
			<div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
				{renderMenu(asset)}
			</div>
			<p
				className="truncate text-[var(--ak-studio-muted-fg)]"
				title={asset.name}
			>
				{asset.name}
			</p>
			{/*
			 * "Photo by <name> on Unsplash" is Unsplash's REQUIRED, fixed-format
			 * credit (API guidelines) — intentionally hardcoded, not i18n-keyed.
			 * The photographer + Unsplash links carry the UTM params the guidelines
			 * mandate; both stopPropagation so a click credits rather than inserts.
			 */}
			{asset.attribution ? (
				<p
					className="truncate text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-image-attribution"
				>
					Photo by{" "}
					<a
						href={asset.attribution.photographerUrl}
						target="_blank"
						rel="noreferrer noopener"
						className="underline"
						onClick={(event) => event.stopPropagation()}
					>
						{asset.attribution.photographerName}
					</a>{" "}
					on{" "}
					<a
						href={asset.attribution.sourceUrl}
						target="_blank"
						rel="noreferrer noopener"
						className="underline"
						onClick={(event) => event.stopPropagation()}
					>
						Unsplash
					</a>
				</p>
			) : null}
		</div>
	);
}

/**
 * Memoized so a parent re-render (e.g. an upload `progress` tick) does not
 * re-render every visible tile — only tiles whose `asset` actually changed.
 * Effective only because `AssetGrid` passes stable `onClick`/`renderMenu`/
 * `onDragStartAsset` references.
 */
export const AssetImageTile = memo(AssetImageTileImpl);
