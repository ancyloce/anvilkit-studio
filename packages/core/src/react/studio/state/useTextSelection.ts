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

import { type ComponentData as PuckComponentData } from "@puckeditor/core";

import { useReactivePuck } from "@/overrides/utils/use-reactive-puck";

/**
 * The currently-selected canvas item, or `null` when nothing is
 * selected. Subscribes the caller to selection changes only — Puck's
 * `createUsePuck` selector compares results with `Object.is`, so
 * re-renders fire only when the reference changes.
 */
export function useSelectedItem(): PuckComponentData | null {
	return useReactivePuck(
		(s) => (s.selectedItem ?? null) as PuckComponentData | null,
	);
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
