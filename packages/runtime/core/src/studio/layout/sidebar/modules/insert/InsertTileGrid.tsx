/**
 * @file 2-column grid container for Puck Drawer.Items in `grid` view mode.
 *
 * Wraps each provided child (a Puck Drawer.Item) in a neutral grid
 * cell. The Drawer.Item is preserved as-is so Puck's drag-and-drop
 * pipeline keeps owning the inner button — we only control the
 * surrounding layout.
 *
 * task Phase 9: 2 columns, not 3 — DESIGN.md's ~280–320px panel width
 * makes a 3-up grid too cramped for a useful thumbnail per tile
 * (`<DrawerItem>` now renders a real thumbnail/preview/icon there,
 * not just a name label), and the task explicitly calls for "approximately
 * two columns in grid mode."
 *
 * Two layouts, switched at {@link WINDOW_THRESHOLD} (review finding M6):
 *
 * - Below threshold the children render as direct cells of a real CSS
 *   `grid grid-cols-2`.
 * - At/above threshold the grid is handed to {@link Windowed}, which
 *   owns its own 2-lane scroll viewport. The outer container drops
 *   `grid-cols-2` in this branch so the viewport spans the full width
 *   (a single child of a `grid-cols-2` parent would collapse into one
 *   1/2-width track); the 2-up layout comes from the primitive's
 *   internal `lanes` grid instead.
 */

import { isValidElement, type ReactNode } from "react";

import { ItemGroup } from "@/primitives";
import { Windowed } from "@/primitives/windowed";
import { cn } from "@/shared/cn";

export interface InsertTileGridProps {
	readonly children: readonly ReactNode[];
	readonly className?: string;
}

/** Switch to the windowed viewport at/above this child count. */
const WINDOW_THRESHOLD = 50;
/** One grid-row height estimate (square tile + label), matches flat search. */
const TILE_ESTIMATE_PX = 88;
const GRID_LANES = 2;

function tileKey(child: ReactNode, index: number): string {
	return isValidElement(child) && child.key != null
		? String(child.key)
		: `tile-${index}`;
}

// Identity renderer — Puck owns the Drawer.Item; we only place it.
// Hoisted for `Windowed`'s referential-stability contract.
function renderTile(child: ReactNode): ReactNode {
	return child;
}

export function InsertTileGrid({
	children,
	className,
}: InsertTileGridProps): ReactNode {
	if (children.length < WINDOW_THRESHOLD) {
		return (
			<ItemGroup
				data-testid="ak-insert-tile-grid"
				className={cn("grid grid-cols-2 gap-2 p-2", className)}
			>
				{children}
			</ItemGroup>
		);
	}

	return (
		<ItemGroup
			data-testid="ak-insert-tile-grid"
			className={cn("p-2", className)}
		>
			<Windowed
				items={children}
				itemKey={tileKey}
				renderItem={renderTile}
				estimateSize={TILE_ESTIMATE_PX}
				lanes={GRID_LANES}
				threshold={0}
				data-testid="ak-insert-tile-grid-window"
			/>
		</ItemGroup>
	);
}
