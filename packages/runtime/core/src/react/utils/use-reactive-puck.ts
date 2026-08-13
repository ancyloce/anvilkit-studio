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

/**
 * {@link useReactivePuck}, but tolerant of rendering outside a
 * `<Puck>` provider — returns `fallback` there instead of throwing.
 *
 * Why the try/catch around a hook is safe here: Puck's `usePuck`
 * calls `useContext` FIRST and throws before any further hook when
 * the context is absent (verified against `createUsePuck` in
 * `@puckeditor/core@0.22`). A mounted component can never move in or
 * out of the provider without remounting, so the hook count is stable
 * per component instance — exactly the invariant the Rules of Hooks
 * protect. This exists for renderers that production always mounts
 * inside `<Puck>` but that unit tests (and potentially hosts) mount
 * bare — optional enhancements like the reset affordance degrade to
 * `fallback` instead of crashing the field.
 */
/**
 * Puck's own signal for "used outside `<Puck>`".
 *
 * Matched on the message because Puck throws a plain `Error` — there is
 * no typed error to test for. Kept deliberately loose (`usePuck` +
 * `<Puck>`) so a wording tweak upstream does not silently turn absence
 * into a re-thrown crash, and narrow enough that a selector bug does not
 * masquerade as absence. Verified against `createUsePuck` and
 * `useGetPuck` in `@puckeditor/core@0.23.0`, which throw
 * "usePuck must be used inside <Puck>." and
 * "usePuckGet must be used inside <Puck>." respectively.
 */
function isMissingPuckProvider(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	return message.includes("usePuck") && message.includes("<Puck>");
}

export function useOptionalReactivePuck<T>(
	selector: (snapshot: PuckSnapshot) => T,
	fallback: T,
): T {
	try {
		// biome-ignore lint/correctness/useHookAtTopLevel: Puck's usePuck throws from useContext (its first hook) when no provider exists, and a component instance can never gain/lose the provider without remounting — hook order is stable in both environments (see file doc above).
		return useReactivePuck(selector);
	} catch (error) {
		// Only "there is no <Puck> here" degrades to the fallback. A bug
		// INSIDE the selector — which runs after zustand's
		// `useSyncExternalStore`, so it lands in this same catch — used to
		// be indistinguishable from absence, and the UI showed `fallback`
		// forever with nothing logged (review 0036 L-2). Anything that is
		// not the provider-absent signal is re-thrown so an error boundary
		// can see it.
		if (!isMissingPuckProvider(error)) {
			throw error;
		}
		return fallback;
	}
}
