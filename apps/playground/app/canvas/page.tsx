"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

/**
 * PLAN-0035 `cp6-004` — zero-configuration canvas route.
 *
 * Konva has no server runtime, so the whole surface loads behind an
 * `ssr: false` dynamic boundary — the same shape `apps/studio` uses, and the
 * shape the `@anvilkit/canvas-editor` README documents. Everything else about
 * the mount is deliberately unconfigured; see `ZeroConfigCanvasSurface.tsx`.
 */
const ZeroConfigCanvasSurface = dynamic(
	() => import("./ZeroConfigCanvasSurface"),
	{
		ssr: false,
		loading: () => (
			<div data-testid="zero-config-canvas-loading">Loading canvas…</div>
		),
	},
);

export default function ZeroConfigCanvasPage(): ReactElement {
	return (
		<main
			data-testid="zero-config-canvas-mount"
			style={{ height: "100vh", width: "100%" }}
		>
			<ZeroConfigCanvasSurface />
		</main>
	);
}
