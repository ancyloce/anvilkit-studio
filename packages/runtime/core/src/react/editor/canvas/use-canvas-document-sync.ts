"use client";

/**
 * @file Chrome→editor canvas-document feed (PLAN-0020 CORE-P1B-001).
 *
 * `CanvasIframe` reports the live iframe document into the bridge so
 * the lazily-loaded DOM registry can bind (and re-bind on document
 * replacement). Entry-chunk safe and inert outside an editor-enabled
 * `<Studio>`. Subscribes to installed-ness so a document reported
 * before the lazy runtime mounted is re-delivered once it has.
 */

import { use, useEffect, useSyncExternalStore } from "react";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

/** Feed the live iframe document into the editor bridge. */
export function useCanvasDocumentSync(doc: Document | undefined): void {
	const bridge = use(StudioEditorBridgeContext);
	const installed = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? no : () => bridge.onCanvasDocumentChange !== null,
		bridge === null ? no : () => bridge.onCanvasDocumentChange !== null,
	);
	useEffect(() => {
		if (bridge === null) {
			return;
		}
		void installed;
		bridge.notifyCanvasDocument(doc ?? null);
		return () => bridge.notifyCanvasDocument(null);
	}, [bridge, doc, installed]);
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
