"use client";

/**
 * @file Chrome-side gate for the unified-compiler stylesheet in the
 * LIVE editor canvas (PLAN-0025 §8.4, P4-07).
 *
 * `CanvasIframe` statically imports this tiny mount; the compile feed
 * (`AppearanceIframeOverride` → `useCompiledAppearance` → style
 * compiler + schema) loads lazily so the eager Studio chunk stays
 * lean (§28 lazy rules). With this mounted, the editor canvas carries
 * the SAME compiled appearance stylesheet as preview, production, and
 * the exporters — the editor-iframe leg of the Phase 4 exit gate.
 *
 * Deliberately NOT gated on the editor bridge: the canvas is a
 * rendering surface, so a v2 document must show its appearance in any
 * `<Studio>` mount, editor feature or not. Documents without
 * appearance props compile to an empty sheet at negligible cost. The
 * legacy sidecar binding (`AuthoringStylesheetMount`) stays mounted
 * beside this one until the Phase 5 migration retires sidecar
 * documents — the two are naturally exclusive per document (a doc has
 * a sidecar or v2 props, never both), so §8.4's one-injection-path
 * rule holds per document form.
 */

import { lazy, type ReactNode, Suspense } from "react";

const AppearanceIframeOverride = lazy(() =>
	import("./AppearanceIframeOverride.js").then((module) => ({
		default: module.AppearanceIframeOverride,
	})),
);

/** Mount the lazy compiled-appearance feed inside the canvas frame. */
export function CompiledAppearanceMount(): ReactNode {
	return (
		<Suspense fallback={null}>
			<AppearanceIframeOverride />
		</Suspense>
	);
}
