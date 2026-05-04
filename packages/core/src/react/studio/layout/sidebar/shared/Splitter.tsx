/**
 * @file Horizontal drag splitter for the `layer` module.
 *
 * Sits between the Pages and Layers sub-panels, persisting its split
 * ratio in `useLayerSplitRatio()` (already clamped to `[0.15, 0.85]`
 * by the store setter). Pointer drag updates ratio relative to the
 * parent grid's content-box; keyboard ArrowUp/Down nudges by 0.02,
 * Home/End snap to the clamps.
 *
 * The store-side clamp means we don't need to clamp here — passing
 * an out-of-range value to `setLayerSplitRatio` is safe.
 *
 * Pointer-events on the canvas iframe are NOT yet suppressed during
 * drag (a planned hardening item — see the build plan §9 risks).
 */

import { type PointerEvent, type ReactNode, useCallback, useRef } from "react";

import { useLayerSplitRatio } from "../../../state/hooks.js";

const KEY_NUDGE = 0.02;
const RATIO_MIN = 0.15;
const RATIO_MAX = 0.85;

export interface SplitterProps {
	/**
	 * Optional ARIA label for the separator. Falls back to a generic
	 * "Resize panel" string — callers should pass a localized label
	 * when the surrounding context warrants one.
	 */
	readonly ariaLabel?: string;
}

export function Splitter({ ariaLabel }: SplitterProps): ReactNode {
	const [ratio, setRatio] = useLayerSplitRatio();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const draggingRef = useRef(false);

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const target = event.currentTarget;
			target.setPointerCapture(event.pointerId);
			draggingRef.current = true;
			document.body.style.cursor = "row-resize";
		},
		[],
	);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!draggingRef.current) return;
			// Resolve the parent grid: the panel that hosts this splitter
			// is the offsetParent two levels up (the grid track itself is
			// a child of the panel container). Using `getBoundingClientRect`
			// against the offsetParent keeps the math correct under zoom
			// and parent transforms.
			const parent = containerRef.current?.parentElement;
			if (parent === null || parent === undefined) return;
			const rect = parent.getBoundingClientRect();
			if (rect.height <= 0) return;
			const next = (event.clientY - rect.top) / rect.height;
			setRatio(next);
		},
		[setRatio],
	);

	const handlePointerUp = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (!draggingRef.current) return;
			draggingRef.current = false;
			event.currentTarget.releasePointerCapture(event.pointerId);
			document.body.style.cursor = "";
		},
		[],
	);

	const handleKeyDown = useCallback(
		(event: { key: string; preventDefault: () => void }) => {
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setRatio(ratio - KEY_NUDGE);
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setRatio(ratio + KEY_NUDGE);
				return;
			}
			if (event.key === "Home") {
				event.preventDefault();
				setRatio(RATIO_MIN);
				return;
			}
			if (event.key === "End") {
				event.preventDefault();
				setRatio(RATIO_MAX);
			}
		},
		[ratio, setRatio],
	);

	return (
		<div
			ref={containerRef}
			role="separator"
			aria-orientation="horizontal"
			aria-valuemin={RATIO_MIN}
			aria-valuemax={RATIO_MAX}
			aria-valuenow={ratio}
			aria-label={ariaLabel ?? "Resize panel"}
			tabIndex={0}
			data-testid="ak-layer-splitter"
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onKeyDown={handleKeyDown}
			className="h-1 cursor-row-resize bg-[var(--ak-studio-border)] outline-none transition-colors hover:bg-[var(--ak-studio-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)] data-[dragging=true]:bg-[var(--ak-studio-accent)]"
		/>
	);
}
