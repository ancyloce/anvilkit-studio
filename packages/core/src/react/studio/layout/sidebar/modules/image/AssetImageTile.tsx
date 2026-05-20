/**
 * @file Square 1:1 image tile (PRD §7.2). Lazy-loaded thumbnail with
 * an overflow menu top-right and a filename caption below.
 */

import { type DragEvent, type ReactNode } from "react";
import { encodeDropPayload } from "@/canvas-drop";
import { Button } from "@/primitives/button";
import type { StudioAsset } from "@/types/sidebar";

export interface AssetImageTileProps {
  readonly asset: StudioAsset;
  readonly onClick: () => void;
  readonly menu: ReactNode;
}

export function AssetImageTile({
  asset,
  onClick,
  menu,
}: AssetImageTileProps): ReactNode {
  const src = asset.thumbnailUrl ?? asset.url;
  return (
    <div
      className="group relative flex flex-col gap-1 text-xs"
      data-testid={`ak-image-tile-${asset.id}`}
    >
      <Button
        variant="ghost"
        onClick={onClick}
        draggable
        onDragStart={(event: DragEvent<HTMLButtonElement>) => {
          encodeDropPayload(event.dataTransfer, {
            kind: "image",
            url: asset.url,
            alt: asset.name,
          });
          event.dataTransfer.effectAllowed = "copy";
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
        {menu}
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
