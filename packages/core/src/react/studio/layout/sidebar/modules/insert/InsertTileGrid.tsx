/**
 * @file 2-column grid container for Puck Drawer.Items in `grid` view mode.
 *
 * Wraps each provided child (a Puck Drawer.Item) in a `<div>` styled
 * to act as a card cell. The Drawer.Item is preserved as-is so Puck's
 * drag-and-drop pipeline keeps owning the inner button — we only
 * control the surrounding layout.
 *
 * Per Q4 in the build plan, v1 does not inject preview thumbnails
 * into Drawer.Items; the cells are sized to a square aspect so that
 * future thumbnails (or a `drawerItem` override) drop in without
 * breaking the layout.
 */

import { type ReactNode, isValidElement } from "react";

import { cn } from "../../../../../overrides/utils/cn.js";

export interface InsertTileGridProps {
	readonly children: readonly ReactNode[];
	readonly className?: string;
}

export function InsertTileGrid({
	children,
	className,
}: InsertTileGridProps): ReactNode {
	return (
		<div
			data-testid="ak-insert-tile-grid"
			className={cn("grid grid-cols-2 gap-1.5 p-2", className)}
		>
			{children.map((child, index) => {
				const key = isValidElement(child)
					? (child.key ?? `tile-${index}`)
					: `tile-${index}`;
				return (
					<div
						key={key}
						className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-2 text-center text-xs text-[var(--ak-studio-fg)] transition-colors hover:border-[var(--ak-studio-accent)]"
					>
						{child}
					</div>
				);
			})}
		</div>
	);
}
