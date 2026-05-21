/**
 * @file `Windowed` — threshold-gated list/grid virtualization for
 * large sidebar collections (review finding M6).
 *
 * Below `threshold` items the component renders the plain mapped list
 * (identical DOM to a hand-written `.map()`), so small lists, existing
 * snapshots, and tests are completely unaffected. At or above the
 * threshold it switches to `@tanstack/react-virtual`: an internal
 * scroll viewport renders only the visible window + overscan, bounding
 * client-side render cost no matter how large the dataset grows.
 * Server/source pagination (e.g. `ImageModule.listPaginated`) is
 * orthogonal and unchanged — this only caps DOM nodes for whatever the
 * source has already handed us.
 *
 * `lanes` drives multi-column grids (e.g. the 3-up image grid). The
 * **caller owns the layout container** (its existing `data-testid` +
 * classes): below threshold `Windowed` emits only the items (keyed
 * `Fragment`s, no wrapper) so they stay direct children of that
 * container; above threshold it renders its own scroll viewport
 * (tagged `data-virtualized`) for the perf tests to assert against.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, type ReactNode, useRef } from "react";

export interface WindowedProps<T> {
	readonly items: readonly T[];
	/**
	 * Renders one item. **Must be `useCallback`-stable.** This is a
	 * large-list performance primitive; a fresh inline
	 * `renderItem={(it) => <Row item={it} />}` allocates a new function
	 * every parent render, which re-renders every row (virtualized or
	 * not) and defeats the entire purpose of windowing. Define it once
	 * with `useCallback` (or hoist it) and keep its dependency list
	 * minimal. (Review §2.3.)
	 */
	readonly renderItem: (item: T, index: number) => ReactNode;
	readonly itemKey: (item: T, index: number) => string;
	/** Estimated row height in px (one lane row for grids). */
	readonly estimateSize: number;
	/** Column count for grid layouts. Default `1` (vertical list). */
	readonly lanes?: number;
	/** Switch to virtualization at/above this count. Default `50`. */
	readonly threshold?: number;
	/** Scroll viewport height (px) when virtualized. Default `320`. */
	readonly maxHeight?: number;
	/** testid for the virtualized scroll viewport (perf assertions). */
	readonly "data-testid"?: string;
}

export function Windowed<T>({
	items,
	renderItem,
	itemKey,
	estimateSize,
	lanes = 1,
	threshold = 50,
	maxHeight = 320,
	"data-testid": testId,
}: WindowedProps<T>): ReactNode {
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Below threshold: emit only the items as keyed `Fragment`s (no DOM
	// node), so they stay direct children of the caller's layout
	// container — CSS grid lanes, existing testids and snapshots are
	// byte-for-byte unchanged.
	if (items.length < threshold) {
		return (
			<>
				{items.map((item, i) => (
					<Fragment key={itemKey(item, i)}>{renderItem(item, i)}</Fragment>
				))}
			</>
		);
	}

	return (
		<Virtualized
			{...{
				items,
				renderItem,
				itemKey,
				estimateSize,
				lanes,
				maxHeight,
				testId,
				scrollRef,
			}}
		/>
	);
}

function Virtualized<T>(props: {
	items: readonly T[];
	renderItem: (item: T, index: number) => ReactNode;
	itemKey: (item: T, index: number) => string;
	estimateSize: number;
	lanes: number;
	maxHeight: number;
	testId?: string;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}): ReactNode {
	const {
		items,
		renderItem,
		itemKey,
		estimateSize,
		lanes,
		maxHeight,
		testId,
		scrollRef,
	} = props;

	const rowCount = Math.ceil(items.length / lanes);
	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimateSize,
		overscan: 6,
	});

	return (
		<div
			ref={scrollRef}
			data-testid={testId}
			data-virtualized="true"
			style={{ maxHeight, overflowY: "auto" }}
		>
			<div
				style={{
					height: virtualizer.getTotalSize(),
					position: "relative",
					width: "100%",
				}}
			>
				{virtualizer.getVirtualItems().map((row) => {
					const start = row.index * lanes;
					const slice = items.slice(start, start + lanes);
					return (
						<div
							key={row.key}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${row.start}px)`,
								display: lanes > 1 ? "grid" : "flex",
								gridTemplateColumns:
									lanes > 1 ? `repeat(${lanes}, minmax(0, 1fr))` : undefined,
								flexDirection: lanes > 1 ? undefined : "column",
								gap: 8,
							}}
						>
							{slice.map((item, j) => {
								const index = start + j;
								return (
									<div key={itemKey(item, index)}>
										{renderItem(item, index)}
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
