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
 * During pointer drag we set `pointer-events: none` on the live Puck
 * preview iframe so the captured pointer is never poached when the
 * cursor crosses the canvas. The previous inline value is stashed
 * and restored on `pointerup` / `pointercancel` / unmount.
 */

import {
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	resolveQueryRoot,
	useStudioRootRef,
} from "@/context/StudioRootProvider";
import { useMsg } from "@/state/editor-i18n-context";
import { useLayerSplitRatio } from "@/state/slices/editor-ui-selectors";

const KEY_NUDGE = 0.02;
const RATIO_MIN = 0.15;
const RATIO_MAX = 0.85;
const PUCK_IFRAME_SELECTOR = 'iframe[id^="preview-frame"]';

// Module-scoped, ref-counted owner for the *global* body cursor (finding
// P2-4). `document.body` is shared by every `<Studio>`, so per-instance
// stash/restore can corrupt it when two splitters drag at once — the last
// release would write back a stale value. Instead the FIRST active drag
// across all splitters snapshots the host's prior cursor and sets
// "row-resize"; the LAST to end restores the snapshot. (Mirrors the
// ref-counted `<html>` theme owner in `use-theme-sync.ts`.)
let bodyCursorDraggers = 0;
let bodyCursorPrev = "";

function acquireBodyDragCursor(): void {
	if (bodyCursorDraggers === 0 && typeof document !== "undefined") {
		bodyCursorPrev = document.body.style.cursor;
		document.body.style.cursor = "row-resize";
	}
	bodyCursorDraggers += 1;
}

function releaseBodyDragCursor(): void {
	if (bodyCursorDraggers === 0) return;
	bodyCursorDraggers -= 1;
	if (bodyCursorDraggers === 0 && typeof document !== "undefined") {
		document.body.style.cursor = bodyCursorPrev;
		bodyCursorPrev = "";
	}
}

export interface SplitterProps {
	/**
	 * Optional ARIA label override for the separator. When omitted the
	 * splitter resolves `studio.module.layer.splitter.label` through the
	 * Studio i18n catalog.
	 */
	readonly ariaLabel?: string;
}

export function Splitter({ ariaLabel }: SplitterProps): ReactNode {
	const msg = useMsg();
	const [ratio, setRatio] = useLayerSplitRatio();
	const containerRef = useRef<HTMLDivElement | null>(null);
	const draggingRef = useRef(false);
	const [dragging, setDragging] = useState(false);
	// Track the iframe whose pointerEvents we suppressed (and the
	// previous inline value) so we restore exactly what we found —
	// even if React unmounts mid-drag.
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const iframePointerEventsRef = useRef<string>("");
	// Whether THIS splitter currently holds a body-cursor drag lease, so the
	// shared owner is acquired/released exactly once per drag (and released
	// on an unmount mid-drag) without double-counting.
	const bodyDraggingRef = useRef(false);
	// Scope the iframe lookup to THIS Studio's root subtree — Puck
	// hardcodes `id^="preview-frame"`, so a global query would suppress
	// the wrong editor's iframe when two are on one page (finding H3).
	const rootRef = useStudioRootRef();

	const suppressIframePointer = useCallback(() => {
		const iframe =
			resolveQueryRoot(rootRef).querySelector<HTMLIFrameElement>(
				PUCK_IFRAME_SELECTOR,
			);
		if (iframe === null) return;
		iframeRef.current = iframe;
		iframePointerEventsRef.current = iframe.style.pointerEvents;
		iframe.style.pointerEvents = "none";
	}, [rootRef]);

	const restoreIframePointer = useCallback(() => {
		const iframe = iframeRef.current;
		if (iframe === null) return;
		iframe.style.pointerEvents = iframePointerEventsRef.current;
		iframeRef.current = null;
		iframePointerEventsRef.current = "";
	}, []);

	const beginBodyDrag = useCallback(() => {
		if (bodyDraggingRef.current) return;
		bodyDraggingRef.current = true;
		acquireBodyDragCursor();
	}, []);

	const endBodyDrag = useCallback(() => {
		if (!bodyDraggingRef.current) return;
		bodyDraggingRef.current = false;
		releaseBodyDragCursor();
	}, []);

	useEffect(() => {
		return () => {
			restoreIframePointer();
			endBodyDrag();
		};
	}, [restoreIframePointer, endBodyDrag]);

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			event.preventDefault();
			const target = event.currentTarget;
			try {
				target.setPointerCapture(event.pointerId);
			} catch {
				// jsdom and a few older Safari versions reject capture for
				// synthetic pointers; the drag still works without it.
			}
			draggingRef.current = true;
			setDragging(true);
			beginBodyDrag();
			suppressIframePointer();
		},
		[suppressIframePointer, beginBodyDrag],
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
			setDragging(false);
			try {
				event.currentTarget.releasePointerCapture(event.pointerId);
			} catch {
				// See note in handlePointerDown.
			}
			endBodyDrag();
			restoreIframePointer();
		},
		[restoreIframePointer, endBodyDrag],
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
			aria-label={ariaLabel ?? msg("studio.module.layer.splitter.label")}
			tabIndex={0}
			data-testid="ak-layer-splitter"
			data-dragging={dragging ? "true" : undefined}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onKeyDown={handleKeyDown}
			className="h-1 cursor-row-resize bg-[var(--ak-studio-border)] outline-none transition-colors hover:bg-[var(--ak-studio-muted)] focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)] data-[dragging=true]:bg-[var(--ak-studio-accent)]"
		/>
	);
}
