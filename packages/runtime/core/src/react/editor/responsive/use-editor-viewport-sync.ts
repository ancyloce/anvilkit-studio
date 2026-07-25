"use client";

/**
 * @file Chrome→editor viewport-width feed (PLAN-0020 CORE-P1A-008).
 *
 * The viewport preview owns the real preview width (preset width or
 * measured fluid width); this hook mirrors it into the editor's
 * responsive state so follow mode and provenance resolution track the
 * live viewport. Entry-chunk safe and a no-op outside an
 * editor-enabled `<Studio>`. Subscribes to the bridge so the feed
 * re-runs when the lazily-loaded controller installs (the controller
 * dedupes identical widths, so re-feeds never loop).
 */

import { use, useEffect, useSyncExternalStore } from "react";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** Feed the live preview viewport width into the editor bridge. */
export function useEditorViewportSync(width: number): void {
	const bridge = use(StudioEditorBridgeContext);
	// Narrow snapshot: re-render only when controller installed-ness
	// flips, never on ordinary editor commits.
	const installed = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? no : () => bridge.viewport !== null,
		bridge === null ? no : () => bridge.viewport !== null,
	);
	useEffect(() => {
		if (bridge === null || !installed || width <= 0) {
			return;
		}
		bridge.viewport?.notifyViewportWidth(width);
	}, [bridge, width, installed]);
}

function noopSubscribe(): () => void {
	return noop;
}
function noop(): void {
	// The no-bridge store never changes.
}
function no(): boolean {
	return false;
}
