/**
 * @file `useReactivePuck()` — reactive Puck-state selector hook.
 *
 * Puck's docs reserve `useGetPuck()` for callbacks/effects: it returns
 * a non-subscribing snapshot getter, so reading it during render does
 * NOT re-render when Puck state changes. UI whose output must react to
 * Puck state (selection summaries, breadcrumbs, overlay placement)
 * should use a `createUsePuck()` selector instead — it re-renders only
 * when the selected value changes by `Object.is`, so projecting a
 * narrow slice costs the same as a Zustand selector subscription.
 *
 * `createUsePuck()` is constructed lazily at first call (module-scoped
 * singleton) so partial test mocks of `@puckeditor/core` that only
 * stub `useGetPuck` do not crash transitive importers at
 * module-evaluate time. After the first call the same hook reference
 * is invoked unconditionally every render, satisfying the Rules of
 * Hooks. Mirrors the proven pattern in
 * `studio/state/useTextSelection.ts`.
 */

import { createUsePuck, type useGetPuck } from "@puckeditor/core";

export type PuckSnapshot = ReturnType<ReturnType<typeof useGetPuck>>;

// Derived from Puck's real `createUsePuck` signature (not
// `as unknown as`) so a breaking change to that signature fails to
// compile here instead of silently. Structurally `<T>(selector:
// (snapshot: PuckSnapshot) => T) => T` — `PuckSnapshot` is exactly
// `createUsePuck`'s selector-state type.
type ReactivePuckHook = ReturnType<typeof createUsePuck>;

let _useReactivePuck: ReactivePuckHook | null = null;

/**
 * Subscribe the calling component to a projected slice of Puck state.
 * The component re-renders only when `selector`'s return value changes
 * by `Object.is` — keep the projection narrow (a primitive or a stable
 * reference) to avoid re-rendering on unrelated state changes.
 */
export function useReactivePuck<T>(selector: (snapshot: PuckSnapshot) => T): T {
	if (_useReactivePuck === null) {
		_useReactivePuck = createUsePuck();
	}
	return _useReactivePuck(selector);
}
