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
			setSize(
				box !== undefined
					? { width: box.inlineSize, height: box.blockSize }
					: {
							width: entry.contentRect.width,
							height: entry.contentRect.height,
						},
			);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { ref, size };
}
