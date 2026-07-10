/**
 * @file Single-column list container for Puck Drawer.Items in `list` view mode.
 *
 * Each child (a Puck Drawer.Item) renders as a row at natural height
 * inside a vertical column. The Drawer.Item itself is not modified — we
 * only control the surrounding layout so Puck's drag pipeline keeps
 * owning the row.
 *
 * Rows are routed through {@link Windowed}: below its threshold the
 * primitive emits bare keyed `Fragment`s, so small sections render the
 * exact prior DOM (existing testids/snapshots unaffected); a large
 * single section switches to a bounded scroll viewport so the DOM node
 * count stays capped no matter how many components a section claims
 * (review finding M6).
 */

import { isValidElement, type ReactNode } from "react";

import { Accordion } from "@/primitives/accordion";
import { Windowed } from "@/primitives/windowed";
import { cn } from "@/shared/cn";

export interface InsertTileListProps {
	readonly children: readonly ReactNode[];
	readonly className?: string;
}

/** One-lane row height estimate (`min-h-9`, matches the flat search list). */
const ROW_ESTIMATE_PX = 40;

// Hoisted so `Windowed` receives a referentially stable `renderItem` /
// `itemKey` (its large-list contract — see `windowed.tsx`). Neither
// closes over per-render state, so module scope is the cleanest form of
// "stable" here.
function renderTileRow(child: ReactNode): ReactNode {
	return (
		<div className="flex min-h-9 items-center rounded-md px-1 text-sm text-[var(--ak-studio-fg)] transition-colors hover:bg-[var(--ak-studio-muted)]">
			{child}
		</div>
	);
}

function tileKey(child: ReactNode, index: number): string {
	return isValidElement(child) && child.key != null
		? String(child.key)
		: `row-${index}`;
}

export function InsertTileList({
	children,
	className,
}: InsertTileListProps): ReactNode {
	return (
		<Accordion data-testid="ak-insert-tile-list" className={cn(className)}>
			<Windowed
				items={children}
				itemKey={tileKey}
				renderItem={renderTileRow}
				estimateSize={ROW_ESTIMATE_PX}
				data-testid="ak-insert-tile-list-window"
			/>
		</Accordion>
	);
}
