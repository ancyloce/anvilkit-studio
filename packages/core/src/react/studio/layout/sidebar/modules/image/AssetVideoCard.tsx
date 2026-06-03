/**
 * @file 16:9 video card (PRD §7.2). Renders a poster (or first-frame
 * fallback via `<video>`) with a centered play overlay.
 */

import { Play } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Button } from "@/primitives/button";
import type { StudioAsset } from "@/types/sidebar";

export interface AssetVideoCardProps {
	readonly asset: StudioAsset;
	readonly onClick: (asset: StudioAsset) => void;
	/** Builds the per-asset overflow menu (see {@link AssetImageTile}). */
	readonly renderMenu: (asset: StudioAsset) => ReactNode;
}

function AssetVideoCardImpl({
	asset,
	onClick,
	renderMenu,
}: AssetVideoCardProps): ReactNode {
	return (
		<div
			className="group relative flex flex-col gap-1 text-xs"
			data-testid={`ak-image-video-${asset.id}`}
		>
			<Button
				variant="ghost"
				onClick={() => onClick(asset)}
				className="relative aspect-video h-auto w-full overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-black p-0 transition-colors hover:border-[var(--ak-studio-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]"
				aria-label={asset.name}
			>
				{asset.thumbnailUrl !== undefined ? (
					<img
						src={asset.thumbnailUrl}
						alt=""
						loading="lazy"
						decoding="async"
						className="size-full object-cover"
					/>
				) : (
					<video
						src={asset.url}
						preload="metadata"
						muted
						className="size-full object-cover"
					/>
				)}
				<span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
					<Play className="size-6 fill-current" aria-hidden="true" />
				</span>
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
		</div>
	);
}

/** Memoized — see {@link AssetImageTile}. */
export const AssetVideoCard = memo(AssetVideoCardImpl);
