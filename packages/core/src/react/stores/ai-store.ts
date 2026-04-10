/**
 * @file Zustand store for AI copilot generation state (task `core-013`).
 *
 * Holds the UI-level "is a generation in flight, what was the last
 * prompt, did it error, what did the user ask before?" slice. The
 * generation itself happens behind a `generatePage()` callback the
 * host supplies (`aiHost` in the legacy shape or a plugin factory
 * in the modern shape) — this store is purely the **view** over
 * that work.
 *
 * ### Scope boundaries
 *
 * - **No credentials.** `StudioConfigSchema`'s `ai` block
 *   (`core-007`) is explicit about this — API keys and endpoints
 *   belong to the host backend, not the Studio runtime. This store
 *   holds prompts and flags only.
 * - **No result payload.** The generated page data is dispatched
 *   straight into Puck via `ctx.getPuckApi().dispatch(...)` — see
 *   `src/compat/ai-host-adapter.ts` — so storing a copy here would
 *   duplicate Puck's own state.
 * - **Not the AI plugin's own slice.** Plugin-local state (e.g.
 *   the prompt textarea's draft value) lives inside the plugin
 *   factory. This store is the shared surface every Studio
 *   component can read.
 *
 * ### Persistence
 *
 * Only the last 10 {@link AiHistoryEntry} items are written to
 * storage under the key `anvilkit-core-ai`. Everything else is
 * ephemeral:
 *
 * - `isGenerating` must start `false` — same footgun as the export
 *   store's `isExporting`. A reload mid-request must not leave the
 *   UI stuck in a spinner.
 * - `lastPrompt` / `lastError` are UI convenience; losing them on
 *   reload is fine and avoids a stale error persisting across
 *   navigations.
 * - `history` is bounded to 10 via `partialize` so the persisted
 *   blob never grows unbounded across a long session.
 *
 * The 10-entry bound is a trade-off: large enough to power a
 * "recent prompts" recall UI, small enough to stay under
 * `localStorage`'s practical quota even when prompts run to a few
 * KB apiece. Hosts that want richer history should implement it
 * server-side.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-013-react-stores.md | core-013}
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * A single prompt in {@link AiState.history}. The entry is
 * intentionally minimal — prompt text and a timestamp, no result
 * payload, no error record. Failed runs are recorded the same way
 * as successful ones because the UI typically wants to re-run or
 * tweak a prompt regardless of how it ended.
 */
export interface AiHistoryEntry {
	/**
	 * The prompt the user submitted, verbatim.
	 */
	readonly prompt: string;
	/**
	 * `Date.now()` at the moment {@link AiState.startGeneration} was
	 * called with this prompt.
	 */
	readonly at: number;
}

/**
 * Full shape of the AI store — read fields plus the three write
 * actions plus {@link AiState.reset}.
 */
export interface AiState {
	/**
	 * `true` while a generation is in flight. **Never persisted**
	 * — a reload always lands on `false` so the UI can never be
	 * stuck in a spinner.
	 */
	readonly isGenerating: boolean;
	/**
	 * The prompt currently (or most recently) being generated
	 * against, or `null` before any call has been made. Ephemeral.
	 */
	readonly lastPrompt: string | null;
	/**
	 * Error message from the most recent failed call, or `null`
	 * when the most recent call succeeded. **Never persisted** —
	 * showing a stale error after a reload is worse than showing
	 * nothing.
	 */
	readonly lastError: string | null;
	/**
	 * The user's prompt history, oldest first. New prompts are
	 * appended by {@link startGeneration}; {@link partialize} trims
	 * to the last 10 entries when persisting, and {@link clearHistory}
	 * empties the in-memory array.
	 */
	readonly history: readonly AiHistoryEntry[];

	/**
	 * Mark a new generation as in flight. Flips `isGenerating` to
	 * `true`, stashes the prompt in `lastPrompt`, clears any prior
	 * `lastError`, and appends a new {@link AiHistoryEntry} to
	 * `history` with the current timestamp.
	 *
	 * Always pair with a call to {@link finishGeneration} in a
	 * `finally` block, or the store will report a phantom in-flight
	 * state.
	 */
	startGeneration(prompt: string): void;
	/**
	 * Clear the in-flight flag. Pass `false` with an `error` string
	 * to record a failure; pass `true` to record success.
	 *
	 * Note the ok-first ordering — it mirrors `recordExport` in the
	 * export store and keeps the two callsites parallel.
	 */
	finishGeneration(ok: boolean, error?: string): void;
	/**
	 * Empty the in-memory history array. Persisted storage is
	 * overwritten on the next `set` — there is no explicit
	 * storage-clear call because the next `partialize` run will
	 * write an empty array.
	 */
	clearHistory(): void;
	/**
	 * Restore every field to its initial state. See the matching
	 * note on {@link ExportState.reset}.
	 */
	reset(): void;
}

/**
 * Persisted slice shape — last 10 history entries only. Declared
 * explicitly so a field rename on {@link AiState} fails to compile
 * here instead of silently dropping the persisted data.
 */
interface AiStorePartial {
	readonly history: readonly AiHistoryEntry[];
}

/**
 * Immutable initial state. Action functions are injected inside
 * `create` below; reset shallow-merges this object over the current
 * state so the actions survive.
 */
const INITIAL_STATE = {
	isGenerating: false,
	lastPrompt: null as string | null,
	lastError: null as string | null,
	history: [] as readonly AiHistoryEntry[],
} as const;

/**
 * Upper bound on the persisted history length. Chosen to be large
 * enough for a "recent prompts" UI while staying well under
 * `localStorage`'s practical quota when each prompt runs to a few
 * KB. See the file header for the full rationale.
 */
const HISTORY_PERSIST_LIMIT = 10;

/**
 * Zustand store for AI copilot generation state.
 *
 * @example
 * // Inside a plugin-agnostic Studio panel:
 * const isGenerating = useAiStore((s) => s.isGenerating);
 * const history = useAiStore((s) => s.history);
 *
 * // Inside the generation lifecycle (typically <Studio>):
 * useAiStore.getState().startGeneration(prompt);
 * try {
 *   await generatePage(prompt);
 *   useAiStore.getState().finishGeneration(true);
 * } catch (err) {
 *   useAiStore.getState().finishGeneration(false, String(err));
 * }
 */
export const useAiStore = create<AiState>()(
	persist(
		(set) => ({
			...INITIAL_STATE,
			startGeneration(prompt) {
				set((state) => ({
					isGenerating: true,
					lastPrompt: prompt,
					// Starting a new run clears the previous error so the
					// UI does not show a stale failure next to a fresh
					// in-flight spinner.
					lastError: null,
					history: [...state.history, { prompt, at: Date.now() }],
				}));
			},
			finishGeneration(ok, error) {
				set({
					isGenerating: false,
					// On success, clear any prior error. On failure,
					// record the error string (coerced to `null` if the
					// caller omitted it, keeping the field a strict
					// `string | null`).
					lastError: ok ? null : (error ?? null),
				});
			},
			clearHistory() {
				set({ history: [] });
			},
			reset() {
				set({ ...INITIAL_STATE });
			},
		}),
		{
			name: "anvilkit-core-ai",
			// Persist only the last N history entries. Slicing inside
			// `partialize` means the bound is enforced at write time;
			// the in-memory `history` array can legitimately grow
			// larger during a long session and the next `set` simply
			// trims it on the way to disk.
			partialize: (state): AiStorePartial => ({
				history: state.history.slice(-HISTORY_PERSIST_LIMIT),
			}),
		},
	),
);
