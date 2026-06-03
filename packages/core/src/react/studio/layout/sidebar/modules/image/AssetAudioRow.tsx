/**
 * @file Audio row (PRD §7.2). Single-row layout with leading note
 * icon, filename, optional size, and an overflow menu trigger.
 */

import { Music } from "lucide-react";
import { memo, type ReactNode } from "react";
import { Button } from "@/primitives/button";
import type { StudioAsset } from "@/types/sidebar";

export interface AssetAudioRowProps {
	readonly asset: StudioAsset;
	readonly onClick: (asset: StudioAsset) => void;
	/** Builds the per-asset overflow menu (see {@link AssetImageTile}). */
	readonly renderMenu: (asset: StudioAsset) => ReactNode;
}

function AssetAudioRowImpl({
	asset,
	onClick,
	renderMenu,
}: AssetAudioRowProps): ReactNode {
	return (
		<div
			className="group flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-[var(--ak-studio-border)] hover:bg-[var(--ak-studio-muted)]"
			data-testid={`ak-image-audio-${asset.id}`}
		>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onClick(asset)}
				className="h-auto flex-1 justify-start gap-2 p-0 text-start font-normal text-[var(--ak-studio-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]"
				aria-label={asset.name}
			>
				<Music
					className="size-4 shrink-0 text-[var(--ak-studio-muted-fg)]"
					aria-hidden="true"
				/>
				<span className="truncate" title={asset.name}>
					{asset.name}
				</span>
				{asset.size !== undefined ? (
					<span className="ms-auto shrink-0 text-[var(--ak-studio-muted-fg)]">
						{formatSize(asset.size)}
					</span>
				) : null}
			</Button>
			<div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
				{renderMenu(asset)}
			</div>
		</div>
	);
}

/** Memoized — see {@link AssetImageTile}. */
export const AssetAudioRow = memo(AssetAudioRowImpl);

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
