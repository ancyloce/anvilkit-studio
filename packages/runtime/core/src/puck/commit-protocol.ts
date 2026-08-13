/**
 * @file The ONE commit protocol shared by every `commit*` helper
 * (review 0036 M-2). Pure, React-free.
 *
 * ## What every commit helper was doing
 *
 * ```ts
 * const current = api.appState.data;
 * const result = run(current);
 * if (result.status !== "updated") return failure(result);
 * api.dispatch({
 *   type: "setData",
 *   recordHistory: true,
 *   data: (previous) => previous === current ? result.data : run(previous).data,
 * });
 * return { status: "committed", … };   // ← decided from the FIRST run
 * ```
 *
 * The functional updater is right: a document that moved between
 * validation and the reducer should be re-derived, not clobbered. The
 * bookkeeping around it was not.
 *
 * `run(previous)` can legitimately come back `noop` or `rejected`, and
 * every pure helper returns its INPUT document in that case. So the
 * retry branch wrote `previous` back unchanged while the caller had
 * already been told `"committed"` — and because `recordHistory: true`
 * is fixed on the action, Puck's `storeInterceptor` recorded the
 * no-change state anyway, leaving an undo entry that appears to do
 * nothing. The protocol can still report that retry honestly without
 * relying on Puck's undocumented interceptor evaluation order.
 *
 * ## What this does instead
 *
 * Puck's `PuckApi` is itself a snapshot: `appState` is a plain value on
 * the object returned by `useGetPuck()`, not a live getter into the
 * store. Re-reading `api.appState` therefore cannot close a window; it
 * only returns the same snapshot again. Callers obtain the API and
 * invoke this protocol synchronously, so this function reads that
 * snapshot once and leaves the one real concurrency window to Puck's
 * functional updater.
 *
 * **During the dispatch**, Puck applies actions synchronously
 * (`dispatch: (action) => set((s) => …)` in its app store), so the
 * updater's real outcome is readable by the time `dispatch()` returns.
 * It is captured and handed back, so the caller reports what actually
 * landed rather than what it hoped would.
 *
 * A caller must not retain a `PuckApi` snapshot across asynchronous
 * work. It must retrieve the current API immediately before invoking a
 * commit helper, as every in-repository caller does.
 *
 * Deliberately NOT done: `storeInterceptor` reads `action.recordHistory`
 * *after* running the reducer, so mutating it from inside the updater
 * would suppress the entry in that last case too. That is undocumented
 * evaluation order, and the Puck contract (CLAUDE.md rule 5) forbids
 * depending on internals — an honest return value is worth more than a
 * clever one.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { Data, PuckApi } from "@puckeditor/core";

/**
 * The shape every pure `*InData` helper returns, and all this protocol
 * needs to know about one.
 */
export interface IntentOutcome {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

/** What actually happened to one commit attempt. */
export interface CommitAttempt<TOutcome extends IntentOutcome> {
	/**
	 * The run whose result actually reached the document — the retry's,
	 * when one happened. Callers must read their id lists off THIS, not
	 * off their own first run.
	 */
	readonly outcome: TOutcome;
	/** True only when a real change was written. */
	readonly committed: boolean;
}

/**
 * Apply one user intent as at most ONE history-recording `setData`.
 *
 * `run` must be pure and deterministic: it is called up to two times
 * against different documents. Where an intent mints ids, hand it an
 * allocator that is stable across runs (review 0036 M-1) — otherwise
 * the retry reports ids the document does not contain.
 *
 * Nothing is dispatched when the snapshot's first derivation is
 * already a noop or rejection. A retry inside Puck's updater reports
 * the outcome that actually reached the reducer.
 */
export function dispatchOneIntent<TOutcome extends IntentOutcome>(
	api: PuckApi,
	run: (data: Data) => TOutcome,
): CommitAttempt<TOutcome> {
	const current = api.appState.data as Data;
	const first = run(current);
	if (first.status !== "updated") {
		return { outcome: first, committed: false };
	}

	// Puck's functional-updater window. `dispatch` reduces synchronously,
	// so `outcome` is settled by the time it returns.
	let outcome = first;
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) => {
			if (previous === current) {
				return first.data;
			}
			const retried = run(previous);
			outcome = retried;
			return retried.status === "updated" ? retried.data : previous;
		},
	} as Parameters<PuckApi["dispatch"]>[0]);

	return { outcome, committed: outcome.status === "updated" };
}

/**
 * Map a failed {@link CommitAttempt} onto the `"noop" | "rejected"`
 * split every commit result type uses.
 */
export function failureStatus(outcome: IntentOutcome): "noop" | "rejected" {
	return outcome.status === "noop" ? "noop" : "rejected";
}
