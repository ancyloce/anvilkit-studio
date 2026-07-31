"use client";

import { type RefObject, useLayoutEffect, useRef, useState } from "react";

export interface MeasuredSize {
	readonly width: number;
	readonly height: number;
}

const INITIAL_SIZE: MeasuredSize = { width: 0, height: 0 };

/**
 * Measures an element's untransformed content-box size via
 * `ResizeObserver`.
 *
 * `ResizeObserver`'s `contentBoxSize` / `contentRect` report the layout
 * box computed BEFORE any CSS `transform` on the observed element —
 * unlike `getBoundingClientRect()`, which reflects the post-transform
 * visual box. The Phase 4 zoom stage (`StudioViewportPreview`) relies on
 * this: the canvas frame carries `transform: scale(zoom)`, and the
 * wrapping zoom stage needs the frame's natural (unscaled) size to
 * compute its own scaled layout dimensions — reading
 * `getBoundingClientRect()` on a scaled element would return the
 * already-scaled size and double-apply the zoom factor.
 */
export function useCanvasFrameSize<T extends HTMLElement = HTMLDivElement>(): {
	readonly ref: RefObject<T | null>;
	readonly size: MeasuredSize;
} {
	const ref = useRef<T | null>(null);
	const [size, setSize] = useState<MeasuredSize>(INITIAL_SIZE);

	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null) return;
		if (typeof ResizeObserver === "undefined") return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry === undefined) return;
			const box = entry.contentBoxSize?.[0];
			const width =
				box !== undefined ? box.inlineSize : entry.contentRect.width;
			const height =
				box !== undefined ? box.blockSize : entry.contentRect.height;
			// Keep the previous object when nothing actually changed: this
			// observer re-fires on every layout tick the canvas causes (zoom,
			// scrollbar appearing, content growing), and a fresh object literal
			// would re-render the whole preview each time even for an identical
			// size — noise on top of a path that is already measurement-driven.
			setSize((prev) =>
				prev.width === width && prev.height === height
					? prev
					: { width, height },
			);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { ref, size };
}
