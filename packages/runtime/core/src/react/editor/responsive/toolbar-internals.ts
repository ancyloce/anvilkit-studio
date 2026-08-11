"use client";

/**
 * @file Bridge-internal accessor for the responsive toolbar
 * (PLAN-0020 CORE-P1A-008).
 *
 * The toolbar needs the live store (breakpoint CRUD through the
 * design-system commit helper) and the viewport controller (write
 * target / toggles) with reactive subscriptions — internal wiring the
 * public `useStudioEditor()` handle deliberately does not expose in
 * raw form.
 */

import type { PuckApi } from "@puckeditor/core";
import { use, useSyncExternalStore } from "react";
import type { StudioEditorBridge } from "../bridge.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import type { InternalStudioViewportController } from "./viewport-controller.js";

/** What the toolbar reads off the bridge. */
export interface StudioEditorInternals {
	/** The live store, or `null` before `<Puck>` mounts (`p3-009`). */
	readonly api: PuckApi | null;
	readonly viewport: InternalStudioViewportController | null;
	/** The bridge itself — the commit helpers need its writer gate. */
	readonly bridge: StudioEditorBridge;
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
		api: bridge.getPuckApi(),
		viewport: bridge.viewport,
		bridge,
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
