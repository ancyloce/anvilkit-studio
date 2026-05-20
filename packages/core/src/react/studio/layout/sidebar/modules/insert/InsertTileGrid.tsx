/**
 * @file 2-column grid container for Puck Drawer.Items in `grid` view mode.
 *
 * Wraps each provided child (a Puck Drawer.Item) in a neutral grid
 * cell. The Drawer.Item is preserved as-is so Puck's drag-and-drop
 * pipeline keeps owning the inner button — we only control the
 * surrounding layout.
 */

import { type ReactNode } from "react";

import { ItemGroup } from "@/primitives";
import { cn } from "@/utils/cn";

export interface InsertTileGridProps {
  readonly children: readonly ReactNode[];
  readonly className?: string;
}

export function InsertTileGrid({
  children,
  className,
}: InsertTileGridProps): ReactNode {
  return (
    <ItemGroup
      data-testid="ak-insert-tile-grid"
      className={cn("grid grid-cols-3 gap-2 p-2", className)}
    >
      {children}
    </ItemGroup>
  );
}
