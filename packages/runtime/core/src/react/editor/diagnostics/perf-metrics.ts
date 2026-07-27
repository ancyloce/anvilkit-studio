"use client";

/**
 * @file Per-`<Studio>` development performance counters
 * (PLAN-0020 CORE-P4-002; DD-0019 §28 overlay bullets).
 *
 * §28 asks the development overlay to report "node and registry
 * counts, command duration, resolver cache hit rate, observer batch
 * size, iframe document generation, and tasks longer than 50 ms".
 * Three of those are already observable without touching hot code:
 *
 * - **command duration** rides the existing content-free
 *   `command.committed` / `gesture.completed` events, so this store
 *   subscribes to the diagnostic port rather than instrumenting the
 *   commit path;
 * - **node and registry counts** are read on demand by the overlay
 *   from the port snapshot and the DOM registry;
 * - **long tasks** come from `PerformanceObserver`, when the browser
 *   supports the `longtask` entry type.
 *
 * The remaining three (resolver cache, observer batches, iframe
 * document generation) need a counter at the producer. Those
 * producers take this store as an **optional** parameter and the
 * store is only created when the overlay is enabled, so a production
 * mount pays one `undefined` check per event and nothing else.
 *
 * Content-free by construction, like every other editor telemetry
 * surface (§29): counts and durations only — never node ids, text,
 * URLs, or prop values.
 */

import type { EditorDiagnosticPort } from "@anvilkit/contracts/editor";

/** Mutable hit/miss counters handed to the stylesheet resolver. */
export interface ResolverCacheStats {
	hits: number;
	misses: number;
}

/** Everything the overlay renders, sampled at one instant. */
export interface EditorPerfSnapshot {
	readonly commandCount: number;
	readonly lastCommandMs: number | null;
	readonly p95CommandMs: number | null;
	readonly resolverCacheHits: number;
	readonly resolverCacheMisses: number;
	/** Hit rate in `[0, 1]`, or `null` before the first lookup. */
	readonly resolverCacheHitRate: number | null;
	readonly lastObserverBatch: number | null;
	readonly maxObserverBatch: number;
	readonly observerCallbackCount: number;
	readonly iframeDocumentGenerations: number;
	readonly longTaskCount: number;
	readonly maxLongTaskMs: number;
	/** False when the browser exposes no `longtask` observer. */
	readonly longTasksObserved: boolean;
}

/** The dev-only counter store (one per `<Studio>` mount). */
export interface EditorPerfMetrics {
	/** Passed to `buildAuthoringStylesheet` as its stats sink. */
	readonly resolverCache: ResolverCacheStats;
	/** One MutationObserver callback carrying `size` records. */
	recordObserverBatch(size: number): void;
	/** A new canvas iframe document was bound. */
	recordIframeDocument(): void;
	getSnapshot(): EditorPerfSnapshot;
	subscribe(listener: () => void): () => void;
	dispose(): void;
}

/** §28's own threshold for a "long" task. */
export const LONG_TASK_THRESHOLD_MS = 50;

/**
 * Ring capacity for command durations. Bounded on purpose: an
 * unbounded array in a dev tool that runs for hours is a leak, and a
 * p95 over the last 200 commands describes the current session far
 * better than one over every command since mount.
 */
const COMMAND_WINDOW = 200;

/** Create the dev counter store, wired to the diagnostic event feed. */
export function createEditorPerfMetrics(
	diagnostics: EditorDiagnosticPort,
): EditorPerfMetrics {
	const listeners = new Set<() => void>();
	const durations: number[] = [];
	const resolverCache: ResolverCacheStats = { hits: 0, misses: 0 };

	let commandCount = 0;
	let lastCommandMs: number | null = null;
	let lastObserverBatch: number | null = null;
	let maxObserverBatch = 0;
	let observerCallbackCount = 0;
	let iframeDocumentGenerations = 0;
	let longTaskCount = 0;
	let maxLongTaskMs = 0;
	let longTasksObserved = false;
	let snapshot: EditorPerfSnapshot | null = null;

	const wake = (): void => {
		snapshot = null;
		for (const listener of listeners) {
			listener();
		}
	};

	const unsubscribeEvents = diagnostics.subscribe((event) => {
		if (
			event.type !== "command.committed" &&
			event.type !== "gesture.completed"
		) {
			return;
		}
		commandCount += 1;
		lastCommandMs = event.durationMs;
		durations.push(event.durationMs);
		if (durations.length > COMMAND_WINDOW) {
			durations.shift();
		}
		wake();
	});

	let observer: PerformanceObserver | null = null;
	// Capability-probe via `supportedEntryTypes`, NOT by seeing whether
	// `observe()` throws: jsdom (and some real engines) accept an unknown
	// entry type silently, which would leave the overlay reporting a
	// confident "0 long tasks" on a platform that never measures any.
	if (
		typeof PerformanceObserver === "function" &&
		(PerformanceObserver.supportedEntryTypes ?? []).includes("longtask")
	) {
		try {
			observer = new PerformanceObserver((list) => {
				let changed = false;
				for (const entry of list.getEntries()) {
					if (entry.duration < LONG_TASK_THRESHOLD_MS) {
						continue;
					}
					longTaskCount += 1;
					maxLongTaskMs = Math.max(maxLongTaskMs, entry.duration);
					changed = true;
				}
				if (changed) {
					wake();
				}
			});
			observer.observe({ entryTypes: ["longtask"] });
			longTasksObserved = true;
		} catch {
			// `longtask` is Chromium-only; elsewhere the row simply reports
			// "unsupported" rather than a misleading zero.
			observer = null;
			longTasksObserved = false;
		}
	}

	return {
		resolverCache,
		recordObserverBatch(size) {
			observerCallbackCount += 1;
			lastObserverBatch = size;
			maxObserverBatch = Math.max(maxObserverBatch, size);
			wake();
		},
		recordIframeDocument() {
			iframeDocumentGenerations += 1;
			wake();
		},
		getSnapshot() {
			// Cached until the next mutation: `useSyncExternalStore` calls
			// this on every render and demands a stable reference between
			// notifications, otherwise React loops forever.
			if (snapshot !== null) {
				return snapshot;
			}
			const lookups = resolverCache.hits + resolverCache.misses;
			snapshot = {
				commandCount,
				lastCommandMs,
				p95CommandMs: percentile(durations, 0.95),
				resolverCacheHits: resolverCache.hits,
				resolverCacheMisses: resolverCache.misses,
				resolverCacheHitRate:
					lookups === 0 ? null : resolverCache.hits / lookups,
				lastObserverBatch,
				maxObserverBatch,
				observerCallbackCount,
				iframeDocumentGenerations,
				longTaskCount,
				maxLongTaskMs,
				longTasksObserved,
			};
			return snapshot;
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose() {
			unsubscribeEvents();
			observer?.disconnect();
			observer = null;
			listeners.clear();
		},
	};
}

/** Nearest-rank percentile; `null` for an empty window. */
function percentile(
	samples: readonly number[],
	fraction: number,
): number | null {
	if (samples.length === 0) {
		return null;
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const rank = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * fraction) - 1),
	);
	return sorted[rank] as number;
}

/**
 * Whether the development overlay should mount.
 *
 * Two gates, both required:
 *
 * 1. `NODE_ENV` is an explicit non-production value. An **absent**
 *    `NODE_ENV` counts as production — that is exactly the shape of a
 *    browser production bundle (same reasoning as the i18n
 *    missing-key warning), and a diagnostic overlay appearing in a
 *    real product would be a defect, not a nuisance.
 * 2. An explicit opt-in: `?akPerf=1` in the URL or
 *    `window.__ANVILKIT_EDITOR_PERF__ = true`. The overlay covers part
 *    of the canvas, so it must never appear unasked — not even in
 *    development.
 */
export function perfOverlayEnabled(): boolean {
	const env = (
		globalThis as unknown as { process?: { env?: Record<string, string> } }
	).process?.env?.NODE_ENV;
	if (env === undefined || env === "production") {
		return false;
	}
	const win = globalThis as unknown as {
		__ANVILKIT_EDITOR_PERF__?: boolean;
		location?: { search?: string };
	};
	if (win.__ANVILKIT_EDITOR_PERF__ === true) {
		return true;
	}
	const search = win.location?.search;
	if (typeof search !== "string" || search === "") {
		return false;
	}
	return new URLSearchParams(search).get("akPerf") === "1";
}
