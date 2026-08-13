"use client";

/**
 * @file The lazily-loaded editor root (PLAN-0020 CORE-P0-012 mount
 * seam; CORE-P1A-001 runtime installation).
 *
 * This module is the code-split boundary for everything editor: it is
 * reached **only** through the dynamic `import()` in
 * `StudioEditorMount`, so no editor code enters the Studio entry chunk
 * while the feature flag is off. It renders `null` — its job is to
 * install the per-instance runtime into the bridge, where
 * `useStudioEditor()` consumers and the controller's data-change feed
 * meet it: the selection store, the scope/viewport controllers, the
 * canvas DOM registry, the inline-edit controller, the capability
 * registry, the diagnostic center, and — since `p3-009` — the
 * canonical `EditorApi` plus the two seams the deleted command port
 * used to own (`getPuckApi`, `getWriterGateError`).
 */

import type { StudioEditorConfig } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import {
	documentBreakpoints,
	type EditorFeatureScanDocument,
} from "../../editor/index.js";
import { useStudioPluginContext } from "../../studio/context/plugin-context.js";
import { createDomAccessibilityScanner } from "./a11y/dom-rules/index.js";
import type { StudioEditorBridge } from "./bridge.js";
import { createCanvasDomRegistry } from "./canvas/dom-registry.js";
import { CanvasHandles } from "./canvas/handles/CanvasHandles.js";
import { CanvasMarquee } from "./canvas/marquee.js";
import { AuthoringOverlayRoot } from "./canvas/overlay-root.js";
import { SelectionToolbar } from "./canvas/SelectionToolbar.js";
import { createEditorCapabilityRegistry } from "./capability-registry.js";
import { computeCollabGateError } from "./collab-gate.js";
import { CreateComponentDialog } from "./components/CreateComponentDialog.js";
import {
	createEditorPerfMetrics,
	type EditorPerfMetrics,
	perfOverlayEnabled,
} from "./diagnostics/perf-metrics.js";
import { createEditorApi } from "./editor-api.js";
import { createInlineEditController } from "./inline/controller.js";
import { RichTextSurfaceMount } from "./inline/RichTextSurfaceMount.js";
import { InteractionRuntimeMount } from "./interactions/InteractionRuntimeMount.js";
import { createStudioViewportController } from "./responsive/viewport-controller.js";
import { createEditorSelectionController } from "./selection.js";
import EditorShortcuts from "./shortcuts/EditorShortcuts.js";

/**
 * The §28 development overlay (CORE-P4-002). A separate lazy chunk so
 * it never reaches the entry or chrome path, and only requested when
 * {@link perfOverlayEnabled} says so — which requires a non-production
 * `NODE_ENV` plus an explicit opt-in.
 */
const PerfOverlay = lazy(async () => import("./diagnostics/PerfOverlay.js"));

/** Props for the editor root. */
export interface EditorRootProps {
	readonly editor: StudioEditorConfig;
	readonly bridge: StudioEditorBridge;
}

/**
 * Builds the command port and installs it into the bridge for the
 * lifetime of the mount. Mount-time revision recanonicalization is
 * implicit: the fresh port parses whatever sidecar the current
 * document carries on its first read (DD-0019 §10.3 rule 5; hosts
 * replace documents by key-remount).
 */
export default function EditorRoot({
	editor,
	bridge,
}: EditorRootProps): ReactNode {
	const ctx = useStudioPluginContext();
	// Decided once per mount: the opt-in reads a URL param / global that
	// must not be re-evaluated on every render (and the overlay
	// appearing mid-session would itself perturb the measurements).
	const [perf] = useState<EditorPerfMetrics | null>(() =>
		perfOverlayEnabled() ? createEditorPerfMetrics(bridge.diagnostics) : null,
	);

	useEffect(() => {
		if (perf === null) {
			return;
		}
		bridge.perf = perf;
		return () => {
			if (bridge.perf === perf) {
				bridge.perf = null;
			}
			perf.dispose();
		};
	}, [bridge, perf]);

	useEffect(() => {
		const diagnostics = bridge.diagnostics;
		// Selection first: the port's snapshot reads the live selection.
		const selection = createEditorSelectionController({
			syncPrimaryToPuck: (nodeId) => {
				// Never a history-recording dispatch — selection must not
				// enter Puck history (§10.6). Tolerates the pre-bind window.
				try {
					const api = ctx.getPuckApi();
					if (nodeId === null) {
						api.dispatch({ type: "setUi", ui: { itemSelector: null } });
						return;
					}
					const selector = api.getSelectorForId(nodeId);
					if (selector !== undefined) {
						api.dispatch({ type: "setUi", ui: { itemSelector: selector } });
					}
				} catch {
					// <Puck> not bound yet: nothing to sync.
				}
			},
			onChange: () => bridge.notify(),
		});
		// `p3-009`: the command port is gone. The two seams it carried for
		// the rest of the runtime — the live `PuckApi` and the collab
		// writer gate — are installed directly on the bridge, beside
		// `canvasRegistry` and `selection`, so the canvas reaches them
		// without a cast and the commit helpers can ENFORCE the gate.
		const tryGetPuckApi = (): ReturnType<typeof ctx.getPuckApi> | null => {
			try {
				return ctx.getPuckApi();
			} catch {
				// Documented on `getPuckApi`: it throws before `<Puck>` binds.
				return null;
			}
		};
		bridge.getPuckApi = tryGetPuckApi;
		// Collab authoring gate (CORE-P1A-013): derived live from the
		// compiled runtime's declarations, so a recompile that adds or
		// removes a transport re-gates deterministically.
		bridge.getWriterGateError = () =>
			computeCollabGateError(bridge.collabCapabilities);
		const capabilities = createEditorCapabilityRegistry({
			getPuckApi: () => ctx.getPuckApi(),
			// Every editor feature is a document carrier now, so the
			// document is the whole feature source (DD-DEC-018).
			readDocument: () =>
				(tryGetPuckApi()?.appState.data ??
					null) as EditorFeatureScanDocument | null,
		});
		// The canonical plugin/AI surface (`p3-008`), built over the same
		// live store and the same commit helpers the UI writes through.
		const api = createEditorApi({
			getPuckApi: () => ctx.getPuckApi(),
			subscribe: bridge.subscribe,
		});
		// Responsive editing state (CORE-P1A-008): transient, never
		// undoable — switching the write target or viewport never
		// dispatches to Puck.
		const viewport = createStudioViewportController({
			onChange: () => bridge.notify(),
		});
		const syncViewportBreakpoints = (): void => {
			// Breakpoints are the document's own `designSystem` root prop
			// (§4.1) since `p3-009`; `documentBreakpoints` falls back to the
			// §12.1 defaults for a document that declares none.
			const data = tryGetPuckApi()?.appState.data ?? ctx.getData();
			viewport.setBreakpoints(documentBreakpoints(data as PuckData));
		};
		syncViewportBreakpoints();
		const unsubscribeViewportSync = bridge.subscribe(syncViewportBreakpoints);
		// Persistent collab-gate diagnostic (§7.4: "neither system is
		// silently disabled"): recomputed on every bridge change so a
		// recompile's new capability list re-derives it; deduped by
		// signature so identical recomputations emit nothing.
		let lastGateSignature = "";
		const refreshCollabGate = (): void => {
			const gateError = computeCollabGateError(bridge.collabCapabilities);
			const signature =
				gateError === null
					? ""
					: JSON.stringify(gateError.details?.plugins ?? []);
			if (signature === lastGateSignature) {
				return;
			}
			lastGateSignature = signature;
			diagnostics.setDiagnostics(
				"collab-gate",
				gateError === null ? [] : [gateError],
			);
		};

		bridge.editorConfig = editor;
		bridge.api = api;
		bridge.selection = selection;
		bridge.capabilities = capabilities;
		bridge.viewport = viewport;
		// P6-01: config decoration is gone — the canvas DOM registry
		// indexes Puck's own `data-puck-component` attribute (its
		// dual-attribute design), and style values reach the canvas
		// through the compiled-appearance mount.
		// Canvas DOM registry (CORE-P1B-001): binds to whatever iframe
		// document the chrome last reported, and re-binds on document
		// replacement (the feed fires again with the new doc).
		const canvasRegistry = createCanvasDomRegistry(
			perf === null
				? undefined
				: {
						onObserverBatch: (recordCount) =>
							perf.recordObserverBatch(recordCount),
					},
		);
		bridge.canvasRegistry = canvasRegistry;
		// Inline editing (CORE-P1B-009B): single-session controller;
		// foreign commits and document replacement interrupt it.
		const inline = createInlineEditController(bridge);
		bridge.inline = inline;
		// DOM a11y scanner (CORE-P1B-011): one per live iframe document.
		let domScanner: ReturnType<typeof createDomAccessibilityScanner> | null =
			null;
		bridge.onCanvasDocumentChange = (doc) => {
			inline.cancel();
			domScanner?.dispose();
			domScanner = null;
			if (doc !== null) {
				canvasRegistry.register(doc);
				domScanner = createDomAccessibilityScanner(bridge, doc);
				perf?.recordIframeDocument();
			}
			bridge.notify();
		};
		if (bridge.canvasDocument !== null) {
			canvasRegistry.register(bridge.canvasDocument);
			domScanner = createDomAccessibilityScanner(bridge, bridge.canvasDocument);
			perf?.recordIframeDocument();
		}
		bridge.responsive = {
			getActiveLayer: () => viewport.getState().activeBreakpoint,
			getViewportWidth: () => viewport.getState().viewportWidth,
		};
		// Every Puck data change wakes the runtime: the viewport's
		// breakpoint list is document state now, and a live inline session
		// must re-check whether the document moved under it.
		bridge.onDataChange = () => {
			syncViewportBreakpoints();
			bridge.inline?.handleExternalInterrupt();
			bridge.notifyStyles();
		};
		bridge.onPuckSelectedChange = selection.handlePuckSelectedChange;
		refreshCollabGate();
		const unsubscribeGate = bridge.subscribe(refreshCollabGate);
		bridge.notifyStyles();
		return () => {
			unsubscribeGate();
			unsubscribeViewportSync();
			// Guard on identity: a StrictMode re-run or a newer mount may
			// already have installed its own runtime.
			if (bridge.api === api) {
				bridge.api = null;
				bridge.getPuckApi = () => null;
				bridge.getWriterGateError = () => null;
				bridge.selection = null;
				bridge.capabilities = null;
				bridge.viewport = null;
				bridge.responsive = null;
				inline.cancel();
				bridge.inline = null;
				bridge.editorConfig = null;
				domScanner?.dispose();
				canvasRegistry.dispose();
				bridge.canvasRegistry = null;
				bridge.onCanvasDocumentChange = null;
				bridge.onDataChange = null;
				bridge.onPuckSelectedChange = null;
				diagnostics.setDiagnostics("collab-gate", []);
				// Same style-channel rule on teardown: the lookup went away.
				bridge.notifyStyles();
			}
		};
	}, [ctx, bridge, editor, perf]);

	// §18 keymap (CORE-P1A-017) + the in-iframe overlay layer
	// (CORE-P1B-003) — both live only while the editor is mounted.
	return (
		<>
			<EditorShortcuts bridge={bridge} />
			{/* §16 preview runtime: binds triggers and drives motion while
			    previewing, and disposes everything on exit. A no-op in
			    design mode (CORE-P3-002). */}
			<InteractionRuntimeMount bridge={bridge} />
			<AuthoringOverlayRoot bridge={bridge}>
				<CanvasHandles bridge={bridge} />
				<CanvasMarquee bridge={bridge} />
				<SelectionToolbar bridge={bridge} />
				<RichTextSurfaceMount bridge={bridge} />
			</AuthoringOverlayRoot>
			{/* Component naming (CORE-P2-009H): must render in the MAIN
			    document, not the canvas iframe where the toolbar that
			    triggers it lives. Renders nothing until a capture is
			    requested. */}
			<CreateComponentDialog />
			{/* §28 dev overlay (CORE-P4-002): never requested in production
			    — `perf` is null unless NODE_ENV is explicitly
			    non-production AND the host opted in. */}
			{perf === null ? null : (
				<Suspense fallback={null}>
					<PerfOverlay bridge={bridge} metrics={perf} />
				</Suspense>
			)}
		</>
	);
}
