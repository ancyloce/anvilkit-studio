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
			className={cn("grid grid-cols-3 gap-2 p-2", className)}
		>
			{children.map((child, index) => {
				const key = isValidElement(child)
					? (child.key ?? `tile-${index}`)
					: `tile-${index}`;
				return (
					<div
						key={key}
						className="group flex aspect-[4/3] items-end justify-stretch overflow-hidden rounded-md border border-[var(--ak-studio-border)] bg-gradient-to-br from-[var(--ak-studio-panel)] to-[var(--ak-studio-bg)] p-1.5 text-left text-[10px] leading-tight text-[var(--ak-studio-fg)] transition-colors hover:border-[var(--ak-studio-accent)] [&_button]:flex [&_button]:size-full [&_button]:flex-col [&_button]:items-start [&_button]:justify-end [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-[10px] [&_button]:text-[var(--ak-studio-muted-fg)] [&_button:hover]:text-[var(--ak-studio-fg)]"
					>
						{child}
					</div>
				);
			})}
		</div>
	);
}
