"use client";

/**
 * @file The per-`<Studio>` editor bridge (PLAN-0020 CORE-P1A-001).
 *
 * The command port and every editor provider live in the lazily-loaded
 * editor chunk (`EditorRoot`), but three parties outside that chunk
 * need a rendezvous point with it:
 *
 * - the controller's `handleChange`, which must tell the editor about
 *   every Puck data change (undo/redo, plugin `setData`, host writes)
 *   so foreign sidecar changes invalidate the parsed-state cache;
 * - chrome components inside Puck's subtree (`useStudioEditor()`),
 *   which need the live port without importing the editor chunk;
 * - the entry-side `StudioEditorMount`, which provides the
 *   `AuthoringStyleContext` lookup that decorated renders consume.
 *
 * The bridge is that rendezvous: a tiny mutable container plus a
 * minimal external-store protocol (`subscribe`/version counters) that
 * `useSyncExternalStore` can drive. It is **entry-chunk safe**: no
 * engine, schema, or Puck runtime imports — only contract types.
 * Slots stay `null` until the lazy impl installs itself; every entry
 * point is null-tolerant, so the bridge is inert when the editor
 * feature flag is off or the chunk has not loaded yet.
 */

import type {
	EditorCommandPort,
	ResponsiveLayerRef,
	StudioEditorConfig,
	StudioPluginCollabCapability,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import type { EditorCapabilityRegistry } from "../../types/editor-api.js";
import type { CanvasDomRegistry } from "./canvas/dom-registry.js";
import {
	createEditorDiagnosticCenter,
	type EditorDiagnosticCenter,
} from "./diagnostics/center.js";
import type { EditorPerfMetrics } from "./diagnostics/perf-metrics.js";
import type { InternalInlineEditController } from "./inline/controller-types.js";
import type { InternalStudioViewportController } from "./responsive/viewport-controller.js";
import type { EditorSelectionController } from "./selection.js";

/**
 * The rendezvous object between the entry chunk and the lazy editor
 * impl. One instance per `<Studio>` mount (created by the controller,
 * never shared).
 */
export interface StudioEditorBridge {
	/** Subscribe to bridge changes. Returns an unsubscribe function. */
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * Monotonic change counter — the `useSyncExternalStore` snapshot for
	 * general editor state (port installed, command committed, foreign
	 * data change).
	 */
	readonly getVersion: () => number;
	/**
	 * Monotonic counter bumped only when resolved authoring **styles**
	 * change. Kept separate from {@link getVersion} so decorated canvas
	 * renders do not re-render on selection or diagnostic churn.
	 */
	readonly getStyleVersion: () => number;
	/**
	 * Monotonic counter bumped on **every** Puck data change (any
	 * source) — the trigger for surfaces that watch component props
	 * rather than the sidecar (contract a11y rules, CORE-P1A-012).
	 */
	readonly getDataVersion: () => number;
	/** Bump {@link getVersion} and wake subscribers. */
	readonly notify: () => void;
	/** Bump {@link getStyleVersion} (and the general version) and wake subscribers. */
	readonly notifyStyles: () => void;
	/**
	 * Entry-side call point: the controller invokes this on every Puck
	 * `onChange`. Forwards to the impl-installed {@link onDataChange}
	 * handler; a no-op until the editor chunk mounts.
	 */
	readonly notifyDataChange: (data: PuckData) => void;
	/**
	 * Entry-side call point: `CanvasIframe` reports the live iframe
	 * document (and `null` on teardown). The lazy runtime binds the
	 * DOM registry to it (CORE-P1B-001) — rebinding on document
	 * replacement is exactly this call firing again.
	 */
	readonly notifyCanvasDocument: (doc: Document | null) => void;

	/**
	 * The per-instance diagnostic center (CORE-P1A-003/-004). Created
	 * eagerly with the bridge — read side for plugins/chrome, write
	 * side for the editor runtime.
	 */
	readonly diagnostics: EditorDiagnosticCenter;

	/**
	 * Pending create-component-from-selection request (CORE-P2-009H;
	 * ED-COMP-001).
	 *
	 * The capture affordance lives on the canvas selection toolbar,
	 * which renders **inside the canvas iframe**; the naming dialog
	 * cannot. So the toolbar files a request here and
	 * `CreateComponentDialog` — mounted in the main document — picks it
	 * up, asks for a name, and runs the capture. That indirection is
	 * what removes the hardcoded `"Component"` name without moving a
	 * modal into an iframe.
	 */
	readonly componentCapture: {
		/** File a request to name and capture these nodes. */
		readonly request: (nodeIds: readonly string[]) => void;
		/** The nodes awaiting a name, or `null`. */
		readonly pending: () => readonly string[] | null;
		/** Drop the request (cancel, or after a successful capture). */
		readonly clear: () => void;
	};

	/** The live command port; `null` until the lazy impl mounts. */
	port: EditorCommandPort | null;
	/** The live selection controller (CORE-P1A-002); `null` until mounted. */
	selection: EditorSelectionController | null;
	/** The live capability registry (CORE-P1A-003); `null` until mounted. */
	capabilities: EditorCapabilityRegistry | null;
	/** Impl-installed handler behind {@link notifyDataChange}. */
	onDataChange: ((data: PuckData) => void) | null;
	/**
	 * Impl-installed Puck→Core selection feed, called by the in-Puck
	 * `EditorSelectionBinder` with the selected node id (or `null`).
	 */
	onPuckSelectedChange: ((nodeId: string | null) => void) | null;
	/**
	 * The compiled runtime's collaboration capability projection
	 * (CORE-P0-020 freeze §2), synced in by the controller per compile.
	 * The lazy editor derives the authoring gate from it
	 * (CORE-P1A-013).
	 */
	collabCapabilities: ReadonlyArray<{
		readonly pluginName: string;
		readonly capability: StudioPluginCollabCapability;
	}>;
	/**
	 * The live responsive editing state (CORE-P1A-008); `null` until
	 * installed. Consumers fall back to base-layer writes and a
	 * desktop viewport while absent.
	 */
	responsive: {
		readonly getActiveLayer: () => ResponsiveLayerRef;
		readonly getViewportWidth: () => number;
	} | null;
	/**
	 * The live viewport/write-target controller (CORE-P1A-008);
	 * `null` until the editor runtime mounts.
	 */
	viewport: InternalStudioViewportController | null;
	/**
	 * Chrome-registered focus hook for the Layers search input
	 * (CORE-P1A-017 find-layer); `null` while the panel is unmounted.
	 */
	focusLayerSearch: (() => void) | null;
	/** The last-reported canvas iframe document (`null` = none). */
	canvasDocument: Document | null;
	/** Impl-installed handler behind {@link notifyCanvasDocument}. */
	onCanvasDocumentChange: ((doc: Document | null) => void) | null;
	/** The live canvas DOM registry (CORE-P1B-001); `null` until mounted. */
	canvasRegistry: CanvasDomRegistry | null;
	/** The live inline edit controller (CORE-P1B-009B); `null` until mounted. */
	inline: InternalInlineEditController | null;
	/** The host's `StudioProps.editor` config (policies read side). */
	editorConfig: StudioEditorConfig | null;
	/** DOM-rule scan results (CORE-P1B-011); empty until scanned. */
	domIssues: readonly unknown[];
	/**
	 * Dev-only §28 performance counters (CORE-P4-002). `null` in every
	 * production mount and in development until the overlay is
	 * explicitly opted into — producers guard on it, so the counters
	 * cost one `undefined` check when absent.
	 */
	perf: EditorPerfMetrics | null;
}

/** Create a fresh, inert bridge (one per `<Studio>` instance). */
export function createStudioEditorBridge(): StudioEditorBridge {
	const listeners = new Set<() => void>();
	let version = 0;
	let styleVersion = 0;
	let dataVersion = 0;
	let pendingCapture: readonly string[] | null = null;
	const wake = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};
	const bridge: StudioEditorBridge = {
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getVersion: () => version,
		getStyleVersion: () => styleVersion,
		getDataVersion: () => dataVersion,
		notify: () => {
			version += 1;
			wake();
		},
		notifyStyles: () => {
			styleVersion += 1;
			version += 1;
			wake();
		},
		notifyDataChange: (data) => {
			dataVersion += 1;
			bridge.onDataChange?.(data);
			// Wake prop-watching subscribers even when the sidecar slot is
			// untouched (the port only notifies on sidecar identity change).
			wake();
		},
		notifyCanvasDocument: (doc) => {
			bridge.canvasDocument = doc;
			bridge.onCanvasDocumentChange?.(doc);
		},
		diagnostics: createEditorDiagnosticCenter({
			onDiagnosticsChange: () => bridge.notify(),
		}),
		componentCapture: {
			request: (nodeIds) => {
				pendingCapture = nodeIds.length === 0 ? null : [...nodeIds];
				bridge.notify();
			},
			pending: () => pendingCapture,
			clear: () => {
				if (pendingCapture === null) return;
				pendingCapture = null;
				bridge.notify();
			},
		},
		port: null,
		selection: null,
		capabilities: null,
		onDataChange: null,
		onPuckSelectedChange: null,
		collabCapabilities: [],
		responsive: null,
		viewport: null,
		focusLayerSearch: null,
		canvasDocument: null,
		onCanvasDocumentChange: null,
		canvasRegistry: null,
		inline: null,
		editorConfig: null,
		domIssues: [],
		perf: null,
	};
	return bridge;
}
