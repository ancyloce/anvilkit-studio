"use client";

/**
 * @file `Windowed` — threshold-gated list/grid virtualization for large
 * collections. Shared primitive ported from `@anvilkit/core`'s sidebar
 * `Windowed` (review finding M6) into `@anvilkit/ui` so plugins can reuse
 * it without depending on core internals.
 *
 * Below `threshold` items the component renders the plain mapped list
 * (identical DOM to a hand-written `.map()`), so small lists, existing
 * snapshots, and tests are unaffected. At or above the threshold it
 * switches to `@tanstack/react-virtual`: an internal scroll viewport
 * renders only the visible window + overscan, bounding client-side render
 * cost no matter how large the dataset grows. Source/server pagination is
 * orthogonal and unchanged — this only caps DOM nodes for whatever the
 * caller has already handed us.
 *
 * Two layout modes:
 * - `as="fragment"` (default): the **caller owns the layout container**.
 *   Below threshold `Windowed` emits only the items (keyed `Fragment`s, no
 *   wrapper) so they stay direct children of that container; above
 *   threshold it renders its own `<div>` scroll viewport. `lanes` drives
 *   multi-column grids here.
 * - `as="ul"`: **`Windowed` owns the list.** It renders a `<ul role="list">`
 *   (single-lane) and wraps each `renderItem` output in
 *   `<li role="listitem">` with `aria-posinset`/`aria-setsize`. In this mode
 *   `renderItem` returns the row *content*, not the `<li>`. Use it when the
 *   caller needs real list semantics + a11y (e.g. an asset browser).
 *
 * `activeIndex` lets keyboard-driven callers scroll an off-window row into
 * view declaratively: when it changes the virtualizer `scrollToIndex`es to
 * it (`align: "auto"`, so visible rows don't jump).
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, type ReactNode, useEffect, useRef } from "react";

export interface WindowedProps<T> {
	readonly items: readonly T[];
	/**
	 * Renders one item. **Must be `useCallback`-stable.** This is a
	 * large-list performance primitive; a fresh inline
	 * `renderItem={(it) => <Row item={it} />}` allocates a new function
	 * every parent render, which re-renders every row (virtualized or not)
	 * and defeats the entire purpose of windowing. Define it once with
	 * `useCallback` (or hoist it) and keep its dependency list minimal.
	 *
	 * In `as="ul"` mode this returns the row *content* — `Windowed` supplies
	 * the wrapping `<li>` and its ARIA position attributes.
	 */
	readonly renderItem: (item: T, index: number) => ReactNode;
	readonly itemKey: (item: T, index: number) => string;
	/** Estimated row height in px (one lane row for grids). */
	readonly estimateSize: number;
	/** Column count for grid layouts (ignored when `as="ul"`). Default `1`. */
	readonly lanes?: number;
	/** Switch to virtualization at/above this count. Default `50`. */
	readonly threshold?: number;
	/** Scroll viewport height (px) when virtualized. Default `320`. */
	readonly maxHeight?: number;
	/**
	 * Layout/semantics mode. `"fragment"` (default) lets the caller own the
	 * container; `"ul"` makes `Windowed` render a single-lane
	 * `<ul role="list">` of `<li role="listitem">` rows.
	 */
	readonly as?: "fragment" | "ul";
	/** Accessible name for the list (`as="ul"` only). */
	readonly "aria-label"?: string;
	/**
	 * Index that should be scrolled into view (e.g. the keyboard-focused
	 * row). When it changes the virtualizer scrolls to it with
	 * `align: "auto"`. No-op below the threshold (every row is mounted).
	 */
	readonly activeIndex?: number;
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
	as = "fragment",
	"aria-label": ariaLabel,
	activeIndex,
	"data-testid": testId,
}: WindowedProps<T>): ReactNode {
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Below threshold: render the full list with no scroll viewport. In
	// fragment mode emit keyed `Fragment`s (no DOM node) so they stay direct
	// children of the caller's container — CSS grid lanes, existing testids
	// and snapshots stay byte-for-byte unchanged. In list mode emit the
	// `<ul>` + `<li>`s `Windowed` owns.
	if (items.length < threshold) {
		if (as === "ul") {
			return (
				<ul
					aria-label={ariaLabel}
					style={{ margin: 0, padding: 0, listStyle: "none" }}
				>
					{items.map((item, i) => (
						<li
							aria-posinset={i + 1}
							aria-setsize={items.length}
							key={itemKey(item, i)}
						>
							<WindowedItem item={item} index={i} render={renderItem} />
						</li>
					))}
				</ul>
			);
		}
		return (
			<>
				{items.map((item, i) => (
					<Fragment key={itemKey(item, i)}>
						<WindowedItem item={item} index={i} render={renderItem} />
					</Fragment>
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
				as,
				ariaLabel,
				activeIndex,
				testId,
				scrollRef,
			}}
		/>
	);
}

function WindowedItem<T>({
	item,
	index,
	render,
}: {
	item: T;
	index: number;
	render: (item: T, index: number) => ReactNode;
}) {
	return <>{render(item, index)}</>;
}

function getVirtualGridRowStyle(
	start: number,
	effectiveLanes: number,
): React.CSSProperties {
	return {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		transform: `translateY(${start}px)`,
		display: effectiveLanes > 1 ? "grid" : "flex",
		gridTemplateColumns:
			effectiveLanes > 1
				? `repeat(${effectiveLanes}, minmax(0, 1fr))`
				: undefined,
		flexDirection: effectiveLanes > 1 ? undefined : "column",
		gap: 8,
	};
}

function Virtualized<T>(props: {
	items: readonly T[];
	renderItem: (item: T, index: number) => ReactNode;
	itemKey: (item: T, index: number) => string;
	estimateSize: number;
	lanes: number;
	maxHeight: number;
	as: "fragment" | "ul";
	ariaLabel?: string;
	activeIndex?: number;
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
		as,
		ariaLabel,
		activeIndex,
		testId,
		scrollRef,
	} = props;

	const isList = as === "ul";
	// List mode is single-lane; ignore `lanes` so the row math stays 1:1.
	const effectiveLanes = isList ? 1 : lanes;
	const rowCount = Math.ceil(items.length / effectiveLanes);
	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => estimateSize,
		overscan: 6,
		// Seed the viewport height so the first render computes a real window.
		initialRect: { width: 0, height: maxHeight },
		// Measure the live scroll element, but fall back to the configured
		// `maxHeight` whenever it reports a height of 0 — i.e. before first
		// layout, and in non-layout test environments (jsdom/happy-dom).
		// Without this the virtualizer would render an empty window (no rows)
		// until a resize fires, flashing a blank list on first paint. The
		// element's CSS `maxHeight` caps it to this value once content
		// overflows, so the fallback matches the real laid-out height.
		observeElementRect: (instance, cb) => {
			const element = instance.scrollElement;
			if (!element) {
				return;
			}
			const measure = () => {
				const rect = element.getBoundingClientRect();
				cb({ width: rect.width, height: rect.height || maxHeight });
			};
			measure();
			if (typeof ResizeObserver === "undefined") {
				return;
			}
			const observer = new ResizeObserver(measure);
			observer.observe(element);
			return () => observer.disconnect();
		},
	});

	// Keyboard-driven callers bump `activeIndex`; bring that row into view.
	// `align: "auto"` leaves already-visible rows untouched.
	useEffect(() => {
		if (activeIndex == null) {
			return;
		}
		virtualizer.scrollToIndex(Math.floor(activeIndex / effectiveLanes), {
			align: "auto",
		});
	}, [activeIndex, effectiveLanes, virtualizer]);

	if (isList) {
		return (
			<div
				data-testid={testId}
				data-virtualized="true"
				ref={scrollRef}
				style={{ maxHeight, overflowY: "auto" }}
			>
				<ul
					aria-label={ariaLabel}
					style={{
						height: virtualizer.getTotalSize(),
						position: "relative",
						width: "100%",
						margin: 0,
						padding: 0,
						listStyle: "none",
					}}
				>
					{virtualizer.getVirtualItems().map((row) => {
						const index = row.index;
						// `row.index` is always < `items.length` (virtualizer count),
						// but `noUncheckedIndexedAccess` widens the lookup to `T | undefined`.
						const item = items[index] as T;
						return (
							<li
								aria-posinset={index + 1}
								aria-setsize={items.length}
								key={itemKey(item, index)}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${row.start}px)`,
								}}
							>
								<WindowedItem item={item} index={index} render={renderItem} />
							</li>
						);
					})}
				</ul>
			</div>
		);
	}

	return (
		<div
			data-testid={testId}
			data-virtualized="true"
			ref={scrollRef}
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
					const start = row.index * effectiveLanes;
					const slice = items.slice(start, start + effectiveLanes);
					return (
						<div
							key={row.key}
							style={getVirtualGridRowStyle(row.start, effectiveLanes)}
						>
							{slice.map((item, j) => {
								const index = start + j;
								return (
									<div key={itemKey(item, index)}>
										<WindowedItem
											item={item}
											index={index}
											render={renderItem}
										/>
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
