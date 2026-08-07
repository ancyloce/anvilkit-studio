"use client";

/**
 * @file `useStudioEditor()` — the public React handle to the editor
 * runtime (PLAN-0020 CORE-P1A-001; DD-0019 §22.3).
 *
 * Entry-chunk safe: reads the per-instance {@link StudioEditorBridge}
 * from context and subscribes via `useSyncExternalStore`; the actual
 * command port arrives when the lazy editor chunk installs itself into
 * the bridge. Consumers therefore re-render when the port mounts,
 * when a command commits, and when a foreign data change (undo/redo,
 * plugin write) invalidates the parsed authoring state.
 */

import type {
	EditorDiagnosticPort,
} from "@anvilkit/contracts/editor";
import type {
	EditorCommandPort,
} from "../../editor/legacy/index.js";
import { createContext, use, useSyncExternalStore } from "react";
import type { StudioEditorBridge } from "./bridge.js";
import type { StudioViewportController } from "./responsive/viewport-controller.js";
import type { EditorSelectionController } from "./selection.js";

/**
 * Internal context carrying the per-`<Studio>` bridge. Provided by
 * `StudioEditorMount` only while `editor.features.enabled === true`,
 * so "inside the provider" is equivalent to "editor enabled".
 */
export const StudioEditorBridgeContext =
	createContext<StudioEditorBridge | null>(null);

/**
 * What `useStudioEditor()` returns. `commands` and `selection` are
 * `null` while the lazy editor chunk is still loading
 * (`status: "loading"`); they are the live controllers once installed
 * (`status: "ready"`). Later Phase 1A tasks extend this handle
 * additively (viewport controller).
 */
export interface StudioEditorHandle {
	readonly status: "loading" | "ready";
	readonly commands: EditorCommandPort | null;
	readonly selection: EditorSelectionController | null;
	/** Viewport / write-target controller (§22.3); `null` while loading. */
	readonly viewport: StudioViewportController | null;
	/**
	 * Persistent diagnostics + content-free operational events. Live
	 * from mount (the center is created with the bridge), so chrome can
	 * subscribe before the lazy runtime finishes loading.
	 */
	readonly diagnostics: EditorDiagnosticPort;
}

/**
 * The editor handle for the enclosing `<Studio>`. Throws when called
 * outside an editor-enabled Studio (no provider): the hook is a
 * contract that the editor feature is on — optional consumers use
 * {@link useOptionalStudioEditor}.
 */
export function useStudioEditor(): StudioEditorHandle {
	const handle = useOptionalStudioEditor();
	if (handle === null) {
		throw new Error(
			"useStudioEditor was called outside of an editor-enabled <Studio>. " +
				"Ensure the calling component renders inside <Studio> with " +
				"`editor.features.enabled === true`.",
		);
	}
	return handle;
}

/**
 * Non-throwing variant: returns `null` outside an editor-enabled
 * `<Studio>` so shared chrome (FieldsPanel, LayerTree) can render
 * unchanged when the editor feature is off.
 */
export function useOptionalStudioEditor(): StudioEditorHandle | null {
	const bridge = use(StudioEditorBridgeContext);
	// Subscribing before the null-check would violate hook rules with a
	// conditional subscribe; instead subscribe unconditionally against a
	// no-op store when no bridge exists.
	const version = useSyncExternalStore(
		bridge === null ? noopSubscribe : bridge.subscribe,
		bridge === null ? zero : bridge.getVersion,
		bridge === null ? zero : bridge.getVersion,
	);
	if (bridge === null) {
		return null;
	}
	void version;
	const port = bridge.port;
	return port === null
		? {
				status: "loading",
				commands: null,
				selection: null,
				viewport: null,
				diagnostics: bridge.diagnostics,
			}
		: {
				status: "ready",
				commands: port,
				selection: bridge.selection,
				viewport: bridge.viewport,
				diagnostics: bridge.diagnostics,
			};
}

function noopSubscribe(): () => void {
	return noop;
}

function noop(): void {
	// Intentionally empty: the no-bridge store never changes.
}

function zero(): number {
	return 0;
}
