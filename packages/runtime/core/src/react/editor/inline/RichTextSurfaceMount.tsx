"use client";

/**
 * @file Lazy gate for the canvas rich-text surface (PLAN-0020
 * CORE-P1B-009E; §28 lazy rules): the Tiptap bundle loads only when
 * a `format: "tiptap"` inline session actually starts.
 */

import { lazy, type ReactNode, Suspense, useSyncExternalStore } from "react";
import type { StudioEditorBridge } from "../bridge.js";

const RichTextSurface = lazy(() => import("./rich-text.js"));

/** Props for {@link RichTextSurfaceMount}. */
export interface RichTextSurfaceMountProps {
	readonly bridge: StudioEditorBridge;
}

/** Mounts the lazy Tiptap surface for active rich sessions only. */
export function RichTextSurfaceMount({
	bridge,
}: RichTextSurfaceMountProps): ReactNode {
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const session = bridge.inline?.getSession() ?? null;
	if (session === null || session.target.format !== "tiptap") {
		return null;
	}
	return (
		<Suspense fallback={null}>
			<RichTextSurface bridge={bridge} />
		</Suspense>
	);
}
