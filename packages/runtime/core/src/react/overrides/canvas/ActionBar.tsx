/**
 * @file `ActionBar` — Puck `actionBar` override.
 *
 * Wraps Puck's per-component action bar with the chrome's panel
 * styling and surfaces the parent-action button alongside the
 * children (Puck's per-component controls). The component label
 * is rendered as a tab in `ComponentOverlay` instead of inline,
 * so this bar is purely a floating icon toolbar.
 *
 * Edge clipping (task Phase 8): Puck's `actionBar` override receives
 * only `{label, children, parentAction}` — no target/viewport/zoom
 * rects — so it owns the bar's base position itself; this override
 * can't compute an absolute position from scratch the way
 * `computeActionBarPosition` does. Instead, after Puck places it, a
 * `useLayoutEffect` measures where it actually landed
 * (`getBoundingClientRect()`, correct whether this renders in the
 * canvas iframe or the parent document) and applies a corrective
 * `transform: translate()` via `clampRectIntoViewport()`
 * (`utils/action-bar-position.ts`) only when it overflows.
 *
 * Purely imperative (direct DOM mutation, no React state): this is a
 * paint-only nudge layered on top of Puck's own placement, not a
 * replacement for it, and driving it through `useState` would re-run
 * this same effect on every corrective render — the imperative
 * "reset, measure, reapply" cycle is idempotent by construction
 * (each pass fully determines the final style from scratch), so it
 * never needs a second render to converge.
 */

import { type ReactNode, useLayoutEffect, useRef } from "react";

import { cn } from "@/shared/cn";
import { clampRectIntoViewport } from "../utils/action-bar-position";

export interface ActionBarOverrideProps {
	readonly label?: string;
	readonly children: ReactNode;
	readonly parentAction: ReactNode;
}

export function ActionBar({
	label,
	children,
	parentAction,
}: ActionBarOverrideProps): ReactNode {
	const barRef = useRef<HTMLDivElement | null>(null);

	useLayoutEffect(() => {
		const el = barRef.current;
		if (el === null) return;
		const view = el.ownerDocument.defaultView;
		if (view === null) return;

		const measure = (): void => {
			// Reset before reading so this always measures Puck's OWN
			// placement, never a stale correction from a prior pass.
			el.style.transform = "";
			const rect = el.getBoundingClientRect();
			const { dx, dy } = clampRectIntoViewport(rect, {
				x: 0,
				y: 0,
				width: view.innerWidth,
				height: view.innerHeight,
			});
			if (dx !== 0 || dy !== 0) {
				el.style.transform = `translate(${dx}px, ${dy}px)`;
			}
		};
		measure();

		view.addEventListener("resize", measure);
		return () => view.removeEventListener("resize", measure);
	});

	return (
		<div
			ref={barRef}
			data-ak-action-bar
			data-component-label={label}
			className={cn(
				"flex items-center gap-0.5 rounded-[10px] px-1 py-0.5",
				"border border-[var(--ak-studio-border)]",
				"bg-[var(--editor-panel-raised)] text-[var(--ak-studio-panel-fg)] shadow-[var(--shadow-floating)]",
			)}
		>
			{parentAction}
			{children}
		</div>
	);
}
