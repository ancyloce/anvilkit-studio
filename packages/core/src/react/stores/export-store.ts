/**
 * @file Zustand store for the Studio export pipeline (task `core-013`).
 *
 * Holds the UI-level "what format did the user pick, is an export
 * running, how did the last one go?" slice. The export registry
 * itself (`core-009`) lives on {@link StudioRuntime.exportFormats};
 * this store holds the **view** over that registry — which format the
 * user currently has selected, whether a run is in flight, and a
 * short record of the most recent run.
 *
 * ### Scope boundaries
 *
 * - **Not** the format registry. That is compiled from plugin
 *   registrations in `runtime/compile-plugins.ts` and handed to
 *   `<Studio>` at mount time; the store merely mirrors the ids into
 *   `availableFormats` so UI components can read them reactively.
 * - **Not** the export-execution code. Running an export is a
 *   runtime / lifecycle concern (beforeExport → run → afterExport)
 *   that `<Studio>` owns. This store only records the result via
 *   {@link ExportState.recordExport}.
 * - **Not** plugin-local state. Exporter plugins keep their own
 *   slice (e.g. the HTML exporter's "inline styles" toggle) in
 *   plugin-local state; this store is shared-Studio state only.
 *
 * ### Persistence
 *
 * Only {@link ExportState.currentFormat} is persisted, under the key
 * `anvilkit-core-export`. Everything else is ephemeral:
 *
 * - `availableFormats` is derived from the runtime at mount, so
 *   persisting it would let a stale list survive a plugin swap.
 * - `isExporting` must start `false` — a page reload mid-export is
 *   the classic footgun this explicitly guards against.
 * - `lastExport` is a UI convenience; losing it on reload is fine.
 *
 * ### Reset semantics
 *
 * {@link ExportState.reset} snaps every field back to the initial
 * state — including `currentFormat`. Tests rely on this; `<Studio>`
 * unmount also calls it (wired in `core-014`) so remounting the
 * shell with a different plugin set does not surface the previous
 * run's state.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-013-react-stores.md | core-013}
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * A single entry in {@link ExportState.lastExport} — the record of
 * the most recently completed export attempt.
 *
 * The record is a terse summary (format id, timestamp, ok flag) — no
 * warning payload, no content blob. UI surfaces that need more
 * detail should subscribe to lifecycle events directly.
 */
export interface LastExportRecord {
	/**
	 * The {@link ExportFormatDefinition.id} of the format that ran.
	 */
	readonly formatId: string;
	/**
	 * `Date.now()` at the moment the run completed, successfully or
	 * otherwise.
	 */
	readonly at: number;
	/**
	 * `true` when the exporter's `run()` resolved without throwing;
	 * `false` when it threw. An exporter that returns a result with
	 * `warnings` but does not throw is still considered `ok: true`.
	 */
	readonly ok: boolean;
}

/**
 * Full shape of the export store. Split into read fields (the state
 * snapshot) and setter actions (the write surface).
 *
 * Actions live alongside state on the same object rather than under
 * a nested `actions:` sub-key because the surface is small and
 * consumers read it via selectors. If the store grows past a dozen
 * fields, consider splitting into context / actions like the
 * Zustand v5 "split state and actions" pattern.
 */
export interface ExportState {
	/**
	 * Ids of every export format currently registered with the
	 * runtime, in plugin insertion order. Populated from
	 * `StudioRuntime.exportFormats` at `<Studio>` mount time
	 * (`core-014`); tests pass a synthetic list directly.
	 */
	readonly availableFormats: readonly string[];
	/**
	 * Id of the format the user currently has selected, or `null`
	 * if nothing is selected yet. Persisted across reloads so the
	 * user's last choice survives a page refresh — this is the only
	 * field {@link ExportStorePartial} carries.
	 */
	readonly currentFormat: string | null;
	/**
	 * `true` while an export run is in flight. **Never persisted** —
	 * a reload always lands on `false` so the UI can never be stuck
	 * in a spinner that outlives the request it belonged to.
	 */
	readonly isExporting: boolean;
	/**
	 * Record of the most recent run, or `null` before any run has
	 * completed. Ephemeral — a reload clears it.
	 */
	readonly lastExport: LastExportRecord | null;

	/**
	 * Replace {@link availableFormats} with a new list. Called once
	 * at `<Studio>` mount with the ids from
	 * `StudioRuntime.exportFormats`. Tests pass fresh lists between
	 * cases.
	 */
	setAvailableFormats(ids: readonly string[]): void;
	/**
	 * Set the user's currently selected format. Pass `null` to
	 * clear the selection.
	 */
	setCurrentFormat(id: string | null): void;
	/**
	 * Flip the in-flight flag. The export pipeline in `<Studio>`
	 * wraps this around `beforeExport` / `afterExport` lifecycle
	 * events.
	 */
	setIsExporting(value: boolean): void;
	/**
	 * Record the outcome of a run and stamp it with `Date.now()`.
	 * Called from the `afterExport` lifecycle handler (successful
	 * runs) and the export pipeline's catch block (failed runs).
	 */
	recordExport(formatId: string, ok: boolean): void;
	/**
	 * Restore every field to its initial state. Uses
	 * `useExportStore.getInitialState()` under the hood so the
	 * definition of "initial" lives in exactly one place.
	 */
	reset(): void;
}

/**
 * The shape of the persisted slice — only {@link
 * ExportState.currentFormat} is ever written to storage. Declared
 * as an explicit interface so the `partialize` callback's return
 * type is pinned and a field rename in {@link ExportState} surfaces
 * as a compile error here instead of silently dropping the
 * persisted field.
 */
interface ExportStorePartial {
	readonly currentFormat: string | null;
}

/**
 * The immutable initial state snapshot. Kept as a module-level
 * constant so both the `create` call and {@link ExportState.reset}
 * refer to the same object, and so tests can `expect(...).toEqual`
 * against it without reconstructing the shape by hand.
 *
 * Actions are NOT part of this object — they are added inside the
 * `create` call below. Zustand's `setState` merges shallowly, so
 * passing this as the argument to `set` from `reset()` overwrites
 * only the read fields and leaves the actions intact.
 */
const INITIAL_STATE = {
	availableFormats: [] as readonly string[],
	currentFormat: null as string | null,
	isExporting: false,
	lastExport: null as LastExportRecord | null,
} as const;

/**
 * Zustand store for the export pipeline's view-level state.
 *
 * Uses the v5 curried form — `create<ExportState>()(persist(...))`
 * — which is required when a middleware is in play so TypeScript
 * can infer the middleware's mutator chain. Do not drop the empty
 * call; `create<ExportState>(persist(...))` will not compile.
 *
 * @example
 * // Read the currently selected format inside a component:
 * const currentFormat = useExportStore((s) => s.currentFormat);
 *
 * // Dispatch a lifecycle effect from <Studio>:
 * useExportStore.getState().setIsExporting(true);
 * try {
 *   await runExport(formatId);
 *   useExportStore.getState().recordExport(formatId, true);
 * } finally {
 *   useExportStore.getState().setIsExporting(false);
 * }
 */
export const useExportStore = create<ExportState>()(
	persist(
		(set) => ({
			...INITIAL_STATE,
			setAvailableFormats(ids) {
				set({ availableFormats: ids });
			},
			setCurrentFormat(id) {
				set({ currentFormat: id });
			},
			setIsExporting(value) {
				set({ isExporting: value });
			},
			recordExport(formatId, ok) {
				set({ lastExport: { formatId, at: Date.now(), ok } });
			},
			reset() {
				set({ ...INITIAL_STATE });
			},
		}),
		{
			name: "anvilkit-core-export",
			// Persist only `currentFormat`. Every other field is
			// ephemeral for the reasons documented in the file header.
			partialize: (state): ExportStorePartial => ({
				currentFormat: state.currentFormat,
			}),
		},
	),
);
