"use client";

/**
 * @file The editor diagnostic center (PLAN-0020 CORE-P1A-003/-004;
 * DD-0019 §22.4, §25).
 *
 * One per `<Studio>` instance, created eagerly beside the bridge
 * (entry-chunk safe: contract types only). It is the concrete
 * `EditorDiagnosticPort` handed to plugins and chrome:
 *
 * - **persistent diagnostics** — keyed by owning source (`sidecar`,
 *   `collab-gate`, `byte-limits`, …) so each producer replaces its own
 *   slice without clobbering others; `diagnostic.changed` is emitted
 *   (content-free: severity + count) whenever the set changes;
 * - **operational events** — `emit()` broadcasts to subscribers
 *   synchronously; a throwing listener is isolated (caught and
 *   skipped) so one bad subscriber cannot break the commit path.
 *
 * Payloads are content-free by contract — producers must emit counts,
 * types, and durations only (asserted by the CORE-P1A-004 privacy
 * suite via `assertContentFreeEvent`).
 */

import type {
	EditorDiagnosticPort,
	EditorError,
	EditorEvent,
} from "@anvilkit/contracts/editor";

/** The write side the editor runtime uses; plugins get the read side. */
export interface EditorDiagnosticCenter extends EditorDiagnosticPort {
	/** Broadcast one operational event to all subscribers. */
	emit(event: EditorEvent): void;
	/**
	 * Replace `source`'s persistent diagnostics. An empty array clears
	 * the slice. Emits `diagnostic.changed` when the set changed.
	 */
	setDiagnostics(source: string, diagnostics: readonly EditorError[]): void;
}

/** Create a per-instance diagnostic center. */
export function createEditorDiagnosticCenter(options?: {
	/** Called after the persistent set changes (bridge notification). */
	readonly onDiagnosticsChange?: () => void;
}): EditorDiagnosticCenter {
	const listeners = new Set<(event: EditorEvent) => void>();
	const bySource = new Map<string, readonly EditorError[]>();
	let flattened: readonly EditorError[] = [];

	const rebuild = (): void => {
		flattened = [...bySource.values()].flat();
	};

	const center: EditorDiagnosticCenter = {
		getDiagnostics: () => flattened,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		emit(event) {
			for (const listener of listeners) {
				try {
					listener(event);
				} catch {
					// Failure-isolated (same rule as the plugin event bus): a
					// throwing subscriber never breaks the commit path or its
					// peers.
				}
			}
		},
		setDiagnostics(source, diagnostics) {
			const previous = bySource.get(source);
			if (
				(previous === undefined || previous.length === 0) &&
				diagnostics.length === 0
			) {
				return;
			}
			if (diagnostics.length === 0) {
				bySource.delete(source);
			} else {
				bySource.set(source, diagnostics);
			}
			rebuild();
			const worst = flattened.some((d) => d.severity === "error")
				? "error"
				: flattened.some((d) => d.severity === "warning")
					? "warning"
					: "info";
			center.emit({
				type: "diagnostic.changed",
				severity: flattened.length === 0 ? "info" : worst,
				count: flattened.length,
			});
			options?.onDiagnosticsChange?.();
		},
	};
	return center;
}
