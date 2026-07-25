"use client";

/**
 * @file `useResolvedNodeStyle` — the public per-node resolved-style
 * hook (PLAN-0020 CORE-P1A-005; DD-0019 §22.3, snapshot-gated).
 *
 * Resolves one node's authoring through the single shared
 * materialization pipeline (CORE-P0-018): token substitution →
 * responsive resolution at the live viewport width → the allowlisted
 * CSS serializer. Subscribes to the editor bridge with
 * selector-style granularity — recomputation happens only when the
 * bridge version changes (commit, undo/redo, foreign write) or the
 * inputs change, and the memoized result keeps render identity
 * stable between changes.
 *
 * Returns `undefined` outside an editor-enabled `<Studio>`, while the
 * editor chunk loads, or when `nodeId` is `undefined` — callers can
 * treat "no resolved style" and "editor off" identically.
 */

import { use, useMemo, useSyncExternalStore } from "react";
import {
	type ResolvedAuthoringStyle,
	resolveAuthoringStyle,
	resolveNodeAuthoring,
} from "../../editor/index.js";
import { StudioEditorBridgeContext } from "./use-studio-editor.js";

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_TOKEN_MODE = "default";

/** Resolve one node's materialized authoring style reactively. */
export function useResolvedNodeStyle(
	nodeId: string | undefined,
): ResolvedAuthoringStyle | undefined {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	return useMemo(() => {
		void version;
		const port = bridge?.port;
		if (bridge == null || port == null || nodeId === undefined) {
			return undefined;
		}
		const snapshot = port.getSnapshot();
		const resolved = resolveNodeAuthoring(nodeId, {
			authoring: snapshot.authoring,
			breakpoints: snapshot.breakpoints,
			viewportWidth:
				bridge.responsive?.getViewportWidth() ?? DEFAULT_VIEWPORT_WIDTH,
			tokenMode: DEFAULT_TOKEN_MODE,
		});
		return resolveAuthoringStyle({
			nodeId,
			layout: resolved.layout,
			style: resolved.style,
			typography: resolved.typography,
			hidden: resolved.hidden,
		});
	}, [bridge, nodeId, version]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function zero(): number {
	return 0;
}
