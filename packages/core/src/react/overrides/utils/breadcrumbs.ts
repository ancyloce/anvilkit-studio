/**
 * @file `useBreadcrumbs()` — derives the selection breadcrumb chain
 * from Puck's live state.
 *
 * The fields panel renders a breadcrumb trail like
 * `Root > Hero > Heading` so users can step back up the parent
 * hierarchy without losing context. Puck publishes `itemSelector`
 * (the active selection) and the full zone graph; this hook walks
 * the parent chain from the active node back to the root and
 * returns one descriptor per ancestor.
 */

import { useMemo } from "react";
import { useReactivePuck } from "./use-reactive-puck";

/**
 * One row in the breadcrumb chain. `id` is the Puck item id (or
 * `"root"` for the page root) and `label` is what the UI renders.
 */
export interface BreadcrumbEntry {
	readonly id: string;
	readonly label: string;
}

// Sentinels for the reactive descriptor selector. Empty string = nothing
// selected (empty chain). The NUL marker = a selection that resolves to no
// concrete item (root-only chain). A resolved selection encodes
// `<id>\u001f<type>`; the unit separator cannot appear in a Puck id or type.
const SELECTION_NONE = "";
const SELECTION_ROOT_ONLY = "\u0000";
const ID_TYPE_SEP = "\u001f";

/**
 * Walk from the currently selected item to the root, returning a
 * top-down chain. The root is always entry zero, the active item
 * is always the last entry.
 *
 * Returns `[]` when nothing is selected — callers can then render
 * a placeholder or skip the breadcrumbs row entirely.
 */
export function useBreadcrumbs(): readonly BreadcrumbEntry[] {
	// Subscribe to a primitive fingerprint of the *resolved* selection, NOT the
	// whole `appState.data` object. Puck swaps `data` by reference on every edit
	// (including prop-only edits that leave the breadcrumb unchanged), so the old
	// `s.appState.data` subscription re-rendered the breadcrumb on every
	// keystroke. Projecting `${id}${type}` (or a sentinel) means the hook
	// re-renders only when the chain it would render actually changes.
	const descriptor = useReactivePuck((s) => {
		const sel = s.appState.ui.itemSelector;
		if (sel === null) {
			return SELECTION_NONE;
		}
		const data = s.appState.data;
		const zone =
			sel.zone === undefined || sel.zone === "default-zone"
				? data.content
				: data.zones?.[sel.zone];
		const item = zone?.[sel.index];
		if (item === undefined) {
			return SELECTION_ROOT_ONLY;
		}
		const id = String(item.props?.id ?? `${sel.zone ?? "root"}:${sel.index}`);
		return `${id}${ID_TYPE_SEP}${item.type}`;
	});

	return useMemo(() => {
		if (descriptor === SELECTION_NONE) {
			return [];
		}
		const chain: BreadcrumbEntry[] = [{ id: "root", label: "Root" }];
		if (descriptor === SELECTION_ROOT_ONLY) {
			return chain;
		}
		const sep = descriptor.indexOf(ID_TYPE_SEP);
		chain.push({
			id: descriptor.slice(0, sep),
			label: descriptor.slice(sep + 1),
		});
		return chain;
	}, [descriptor]);
}
