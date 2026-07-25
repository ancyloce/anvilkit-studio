"use client";

/**
 * @file Bridge-internal accessor for the responsive toolbar
 * (PLAN-0020 CORE-P1A-008).
 *
 * The toolbar needs both the command port (breakpoint CRUD) and the
 * viewport controller (write target / toggles) with reactive
 * subscriptions — internal wiring the public `useStudioEditor()`
 * handle deliberately does not expose in raw form.
 */

import { use, useSyncExternalStore } from "react";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import type { InternalStudioViewportController } from "./viewport-controller.js";

/** What the toolbar reads off the bridge. */
export interface StudioEditorInternals {
	readonly port: InternalEditorCommandPort | null;
	readonly viewport: InternalStudioViewportController | null;
}

/** Reactive bridge internals, or `null` outside an editor Studio. */
export function useOptionalStudioEditorInternals(): StudioEditorInternals | null {
	const bridge = use(StudioEditorBridgeContext);
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	if (bridge === null) {
		return null;
	}
	void version;
	return {
		port: bridge.port as InternalEditorCommandPort | null,
		viewport: bridge.viewport,
	};
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
