/**
 * @file Reactive Puck-selection adapter for the `text` module.
 *
 * The Studio's existing `useGetPuck()` returns a snapshot getter that
 * does not subscribe to state changes, which is fine for click-time
 * dispatch but cannot drive UI that needs to reflect the current
 * canvas selection live (PRD §8.6 — snippet rows render dimmed when
 * no compatible text element is selected).
 *
 * Puck 0.21 ships `createUsePuck()` — a typed selector hook generator
 * — alongside the bare `usePuck()`. The selector flavor only re-renders
 * when its return value changes by `Object.is`, so picking out the
 * single field we care about keeps the cost identical to a Zustand
 * selector subscription.
 *
 * Compatibility predicate locked for v1: the selected item must be a
 * Puck component of type `"Text"` whose `text` prop is a string.
 * Broadening (adapters, metadata flags, etc.) is explicit out-of-scope
 * for the StudioSidebar v1 PRD; a future `registerTextSelectionAdapter`
 * surface can widen this without changing call sites.
 */

import {
	createUsePuck,
	type ComponentData as PuckComponentData,
} from "@puckeditor/core";

type PuckSelectorHook = <T>(
	selector: (state: { readonly selectedItem: PuckComponentData | null }) => T,
) => T;

// Lazy-initialized so partial test mocks of `@puckeditor/core` (which
// historically only stub `useGetPuck`) don't blow up at module-evaluate
// time when the consuming module is imported transitively. The first
// hook call constructs the selector hook; subsequent calls reuse it.
let _usePuckSelection: PuckSelectorHook | null = null;
function getUsePuckSelection(): PuckSelectorHook {
	if (_usePuckSelection === null) {
		_usePuckSelection = createUsePuck() as unknown as PuckSelectorHook;
	}
	return _usePuckSelection;
}

/**
 * The currently-selected canvas item, or `null` when nothing is
 * selected. Subscribes the caller to selection changes only — Puck's
 * `createUsePuck` selector compares results with `Object.is`, so
 * re-renders fire only when the reference changes.
 */
export function useSelectedItem(): PuckComponentData | null {
	const usePuckSelection = getUsePuckSelection();
	return usePuckSelection((s) => s.selectedItem ?? null);
}

/**
 * Result of {@link useTextSelection}.
 */
export interface TextSelectionState {
	readonly selected: PuckComponentData | null;
	readonly isCompatibleTextSelection: boolean;
}

function isTextLike(item: PuckComponentData | null): boolean {
	if (item === null) return false;
	if (item.type !== "Text") return false;
	const props = item.props as { readonly text?: unknown };
	return typeof props.text === "string";
}

/**
 * Reactive selection state with the `text`-module compatibility
 * predicate pre-applied. Snippet rows pass the boolean down so they
 * can render dimmed without recomputing the predicate themselves.
 */
export function useTextSelection(): TextSelectionState {
	const selected = useSelectedItem();
	return {
		selected,
		isCompatibleTextSelection: isTextLike(selected),
	};
}
