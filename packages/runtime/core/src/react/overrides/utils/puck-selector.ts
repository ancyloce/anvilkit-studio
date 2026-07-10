/**
 * @function usePuckSelector
 *
 * Typed, **reactive** projection of a narrow Puck-state slice. Backed
 * by `useReactivePuck()` (a `createUsePuck()` selector), so a caller
 * re-renders when its projected value changes by `Object.is` — unlike
 * the old `useGetPuck()` snapshot read, which never subscribed and
 * silently went stale during render.
 *
 * Keep the projection narrow (a primitive or a stable reference) so
 * unrelated Puck state changes do not re-render the caller.
 *
 * @example
 * const isDragging = usePuckSelector((s) => s.appState.ui.isDragging);
 */

import { type PuckSnapshot, useReactivePuck } from "./use-reactive-puck";

export function usePuckSelector<TResult>(
	selector: (snapshot: PuckSnapshot) => TResult,
): TResult {
	return useReactivePuck(selector);
}
