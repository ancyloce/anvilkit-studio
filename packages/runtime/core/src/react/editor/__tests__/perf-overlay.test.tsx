/**
 * The §28 development performance overlay and its counter store
 * (PLAN-0020 CORE-P4-002).
 *
 * Two things matter here beyond "it renders": the overlay must be
 * **impossible to reach in production**, and every counter must report
 * a real observation rather than a plausible-looking zero. Both are
 * tested directly.
 */

import type {
	EditorDiagnosticPort,
	EditorEvent,
} from "@anvilkit/contracts/editor";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import PerfOverlay, {
	PERF_OVERLAY_MARKER,
} from "../diagnostics/PerfOverlay.js";
import {
	createEditorPerfMetrics,
	LONG_TASK_THRESHOLD_MS,
	perfOverlayEnabled,
} from "../diagnostics/perf-metrics.js";

afterEach(() => {
	cleanup();
	delete (globalThis as { __ANVILKIT_EDITOR_PERF__?: boolean })
		.__ANVILKIT_EDITOR_PERF__;
});

/** A diagnostic port whose event feed the test drives by hand. */
function fakeDiagnostics(): {
	port: EditorDiagnosticPort;
	emit: (event: EditorEvent) => void;
} {
	const listeners = new Set<(event: EditorEvent) => void>();
	return {
		port: {
			getDiagnostics: () => [],
			subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
		},
		emit(event) {
			for (const listener of listeners) {
				listener(event);
			}
		},
	};
}

function committed(durationMs: number): EditorEvent {
	return {
		type: "command.committed",
		commandType: "node.layout.set",
		source: "inspector",
		durationMs,
		changedNodeCount: 1,
	};
}

describe("perfOverlayEnabled", () => {
	it("is off without an explicit opt-in, even in development", () => {
		// The overlay covers part of the canvas. Appearing unasked in every
		// dev session would make people disable the editor, not the overlay.
		expect(perfOverlayEnabled()).toBe(false);
	});

	it("turns on for the global opt-in", () => {
		(
			globalThis as { __ANVILKIT_EDITOR_PERF__?: boolean }
		).__ANVILKIT_EDITOR_PERF__ = true;
		expect(perfOverlayEnabled()).toBe(true);
	});

	it("stays off when NODE_ENV is production, opt-in or not", () => {
		(
			globalThis as { __ANVILKIT_EDITOR_PERF__?: boolean }
		).__ANVILKIT_EDITOR_PERF__ = true;
		vi.stubEnv("NODE_ENV", "production");
		expect(perfOverlayEnabled()).toBe(false);
		vi.unstubAllEnvs();
	});
});

describe("editor perf metrics", () => {
	it("starts empty rather than reporting zeros as measurements", () => {
		const { port } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		const snapshot = metrics.getSnapshot();
		expect(snapshot.lastCommandMs).toBeNull();
		expect(snapshot.p95CommandMs).toBeNull();
		expect(snapshot.resolverCacheHitRate).toBeNull();
		expect(snapshot.lastObserverBatch).toBeNull();
		metrics.dispose();
	});

	it("records command durations off the content-free event feed", () => {
		const { port, emit } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		emit(committed(4));
		emit(committed(9));
		emit({ type: "gesture.completed", gesture: "resize", durationMs: 12 });
		const snapshot = metrics.getSnapshot();
		expect(snapshot.commandCount).toBe(3);
		expect(snapshot.lastCommandMs).toBe(12);
		expect(snapshot.p95CommandMs).toBe(12);
		metrics.dispose();
	});

	it("ignores events that carry no duration", () => {
		const { port, emit } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		emit({
			type: "command.rejected",
			commandType: "node.layout.set",
			errorCodes: [],
		});
		expect(metrics.getSnapshot().commandCount).toBe(0);
		metrics.dispose();
	});

	it("returns a stable snapshot reference between mutations", () => {
		// `useSyncExternalStore` re-invokes the getter on every render and
		// loops forever if it returns a fresh object each time.
		const { port, emit } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		const first = metrics.getSnapshot();
		expect(metrics.getSnapshot()).toBe(first);
		emit(committed(1));
		expect(metrics.getSnapshot()).not.toBe(first);
		metrics.dispose();
	});

	it("stops recording after dispose", () => {
		const { port, emit } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		metrics.dispose();
		emit(committed(50));
		expect(metrics.getSnapshot().commandCount).toBe(0);
	});

	it("tracks observer batches and iframe document generations", () => {
		const { port } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		metrics.recordObserverBatch(3);
		metrics.recordObserverBatch(11);
		metrics.recordObserverBatch(2);
		metrics.recordIframeDocument();
		const snapshot = metrics.getSnapshot();
		expect(snapshot.lastObserverBatch).toBe(2);
		expect(snapshot.maxObserverBatch).toBe(11);
		expect(snapshot.observerCallbackCount).toBe(3);
		expect(snapshot.iframeDocumentGenerations).toBe(1);
		metrics.dispose();
	});

	it("keeps §28's own 50 ms long-task threshold", () => {
		expect(LONG_TASK_THRESHOLD_MS).toBe(50);
	});
});

describe("producer instrumentation", () => {
	it("reports the MutationObserver batch size to the registry hook", async () => {
		const batches: number[] = [];
		const registry = createCanvasDomRegistry({
			onObserverBatch: (count) => batches.push(count),
		});
		const doc = document.implementation.createHTMLDocument("registry");
		registry.register(doc);
		const node = doc.createElement("div");
		node.setAttribute("data-ak-node", "a");
		doc.body.appendChild(node);
		await vi.waitFor(() => {
			expect(batches.length).toBeGreaterThan(0);
		});
		expect(batches[0]).toBeGreaterThan(0);
		registry.dispose();
	});

	it("leaves the registry working with no instrumentation attached", () => {
		const registry = createCanvasDomRegistry();
		const doc = document.implementation.createHTMLDocument("registry");
		const node = doc.createElement("div");
		node.setAttribute("data-ak-node", "a");
		doc.body.appendChild(node);
		registry.register(doc);
		expect(registry.listNodeIds()).toEqual(["a"]);
		registry.dispose();
	});
});

describe("PerfOverlay", () => {
	it("renders every §28 row", () => {
		const { port, emit } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		emit(committed(7));
		metrics.recordObserverBatch(4);
		metrics.recordIframeDocument();
		render(
			<EditorI18nProvider>
				<PerfOverlay
					bridge={{ getPuckApi: () => null, canvasRegistry: null } as never}
					metrics={metrics}
				/>
			</EditorI18nProvider>,
		);
		expect(screen.getByTestId(PERF_OVERLAY_MARKER)).toBeTruthy();
		for (const row of [
			"nodes",
			"registry",
			"command",
			"resolver-cache",
			"observer",
			"iframe-doc",
			"long-tasks",
		]) {
			expect(document.querySelector(`[data-perf-row="${row}"]`)).not.toBeNull();
		}
		metrics.dispose();
	});

	it("says 'unsupported' rather than 0 when longtask is unavailable", () => {
		// jsdom exposes no `longtask` entry type. Reporting "0 long tasks"
		// there would be a lie that reads as a clean profile.
		const { port } = fakeDiagnostics();
		const metrics = createEditorPerfMetrics(port);
		expect(metrics.getSnapshot().longTasksObserved).toBe(false);
		render(
			<EditorI18nProvider>
				<PerfOverlay
					bridge={{ getPuckApi: () => null, canvasRegistry: null } as never}
					metrics={metrics}
				/>
			</EditorI18nProvider>,
		);
		const cell = document.querySelector('[data-perf-row="long-tasks"]');
		expect(cell?.textContent).toBe("unsupported");
		metrics.dispose();
	});
});
