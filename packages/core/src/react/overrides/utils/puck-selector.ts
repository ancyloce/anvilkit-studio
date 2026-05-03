/**
 * @function usePuckSelector
 *
 * Typed wrapper around `useGetPuck()` that lets callers project a
 * narrow slice of the Puck snapshot. Re-runs the selector on every
 * render and returns the projected value — Puck's snapshot getter
 * is cheap so memoization is the caller's responsibility.
 *
 * @example
 * const isDragging = usePuckSelector((s) => s.appState.ui.isDragging);
 */

import { useGetPuck } from "@puckeditor/core";

type PuckSnapshot = ReturnType<ReturnType<typeof useGetPuck>>;

export function usePuckSelector<TResult>(
	selector: (snapshot: PuckSnapshot) => TResult,
): TResult {
	const getPuck = useGetPuck();
	return selector(getPuck());
}
