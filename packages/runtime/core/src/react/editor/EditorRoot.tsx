"use client";

/**
 * @file The lazily-loaded editor root (PLAN-0020 CORE-P0-012 mount
 * seam; CORE-P1A-001 command port installation).
 *
 * This module is the code-split boundary for everything editor: it is
 * reached **only** through the dynamic `import()` in
 * `StudioEditorMount`, so no engine code enters the Studio entry
 * chunk while the feature flag is off. It renders `null` — its job is
 * to build the command port over the live plugin context and install
 * it into the per-instance bridge, where `useStudioEditor()`
 * consumers and the controller's data-change feed meet it. Later
 * Phase 1A tasks install the selection store, capability registry,
 * diagnostic port, and style pipeline through the same seam.
 */

import type { StudioEditorConfig } from "@anvilkit/contracts/editor";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import type { EditorFeatureScanDocument } from "../../editor/index.js";
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
import { createEditorCommandPort } from "./command-port.js";
import { CreateComponentDialog } from "./components/CreateComponentDialog.js";
import {
	createEditorPerfMetrics,
	type EditorPerfMetrics,
	perfOverlayEnabled,
} from "./diagnostics/perf-metrics.js";
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
		const port = createEditorCommandPort({
			getPuckApi: () => ctx.getPuckApi(),
			getData: () => ctx.getData(),
			editor,
			getSelection: () => selection.getState(),
			// Collab authoring gate (CORE-P1A-013): derived live from the
			// compiled runtime's declarations, so a recompile that adds or
			// removes a transport re-gates deterministically.
			getWriterGateError: () =>
				computeCollabGateError(bridge.collabCapabilities),
			onStateChange: () => {
				refreshSidecarDiagnostics();
				refreshStyleSignal();
				bridge.inline?.handleExternalInterrupt();
			},
			// Content-free operational events (CORE-P1A-004; DD-0019 §22.4):
			// counts, types, and durations only — never text, URLs, prop
			// values, token literals, or preview data.
			onCommitted: (command, result, meta) => {
				diagnostics.emit({
					type: "command.committed",
					commandType: command.type,
					source: command.source,
					durationMs: meta.durationMs,
					changedNodeCount: result.changedNodeIds.length,
				});
			},
			onRejected: (command, result) => {
				diagnostics.emit({
					type: "command.rejected",
					commandType: command.type,
					errorCodes: result.errors.map((error) => error.code),
				});
			},
		});
		const capabilities = createEditorCapabilityRegistry({
			getPuckApi: () => ctx.getPuckApi(),
			readAuthoring: () => port.readCurrent().state,
			// Prop-level detection needs the document, not just the
			// sidecar — `richText` lives in component props (DD-DEC-018).
			readDocument: () => port.readData() as EditorFeatureScanDocument,
		});
		// Style signal (CORE-P1A-009): decorated canvas renders only need
		// re-rendering when a node GAINS or LOSES authoring (attribute
		// presence); value changes flow through the stylesheet channel.
		let lastAuthoredSignature = "";
		const authoredSignature = (): string =>
			Object.keys(port.readCurrent().state.nodes).sort().join("\u0000");
		const refreshStyleSignal = (): void => {
			const signature = authoredSignature();
			if (signature !== lastAuthoredSignature) {
				lastAuthoredSignature = signature;
				bridge.notifyStyles();
			} else {
				bridge.notify();
			}
		};
		// Responsive editing state (CORE-P1A-008): transient, never
		// undoable — switching the write target or viewport never
		// dispatches to Puck.
		const viewport = createStudioViewportController({
			onChange: () => bridge.notify(),
		});
		const syncViewportBreakpoints = (): void => {
			viewport.setBreakpoints(port.getSnapshot().breakpoints);
		};
		syncViewportBreakpoints();
		const unsubscribeViewportSync = bridge.subscribe(syncViewportBreakpoints);
		// Persistent read-only diagnostic (§24.1/§25): an invalid or
		// unsupported-major sidecar surfaces visibly and keeps surfacing
		// until a foreign change replaces the sidecar with a readable one.
		const refreshSidecarDiagnostics = (): void => {
			const read = port.readCurrent();
			diagnostics.setDiagnostics("sidecar", read.readOnly ? read.errors : []);
		};
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

		lastAuthoredSignature = authoredSignature();
		bridge.editorConfig = editor;
		bridge.port = port;
		bridge.selection = selection;
		bridge.capabilities = capabilities;
		bridge.viewport = viewport;
		// Attribute-only lookup (CORE-P1A-009, widened by CORE-P1B-001):
		// EVERY decorated render stamps `data-ak-node` — the canvas DOM
		// registry needs the attribute on unauthored nodes too (hit
		// testing, selection rings). All style VALUES still reach the
		// canvas through the iframe stylesheet, so inline styles stay
		// empty and media queries keep working in the preview.
		bridge.styleLookup = (nodeId) => ({
			classNames: [],
			inlineStyle: {},
			dataAttributes: { "data-ak-node": nodeId },
			diagnostics: [],
		});
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
		bridge.onDataChange = port.handleDataChange;
		bridge.onPuckSelectedChange = selection.handlePuckSelectedChange;
		refreshSidecarDiagnostics();
		refreshCollabGate();
		const unsubscribeGate = bridge.subscribe(refreshCollabGate);
		// Style-channel wake, not a plain notify: `styleLookup` just
		// became available, and decorated canvas renders only re-read
		// the lookup context when the STYLE version bumps
		// (StudioEditorMount) — a plain notify would leave every
		// already-rendered node unstamped until the first authoring
		// change.
		bridge.notifyStyles();
		return () => {
			unsubscribeGate();
			unsubscribeViewportSync();
			// Guard on identity: a StrictMode re-run or a newer mount may
			// already have installed its own port.
			if (bridge.port === port) {
				bridge.port = null;
				bridge.selection = null;
				bridge.capabilities = null;
				bridge.viewport = null;
				bridge.responsive = null;
				bridge.styleLookup = null;
				inline.cancel();
				bridge.inline = null;
				bridge.editorConfig = null;
				domScanner?.dispose();
				canvasRegistry.dispose();
				bridge.canvasRegistry = null;
				bridge.onCanvasDocumentChange = null;
				bridge.onDataChange = null;
				bridge.onPuckSelectedChange = null;
				diagnostics.setDiagnostics("sidecar", []);
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
