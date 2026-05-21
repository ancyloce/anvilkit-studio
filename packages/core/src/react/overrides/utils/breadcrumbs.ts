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

/**
 * Walk from the currently selected item to the root, returning a
 * top-down chain. The root is always entry zero, the active item
 * is always the last entry.
 *
 * Returns `[]` when nothing is selected — callers can then render
 * a placeholder or skip the breadcrumbs row entirely.
 */
export function useBreadcrumbs(): readonly BreadcrumbEntry[] {
	// Reactive: breadcrumbs must refresh when the selection or page
	// data changes. Each selector projects a stable Puck reference, so
	// the memo only recomputes when one of them actually changes.
	const selector = useReactivePuck((s) => s.appState.ui.itemSelector);
	const data = useReactivePuck((s) => s.appState.data);
	return useMemo(() => {
		if (selector === null) {
			return [];
		}
		const chain: BreadcrumbEntry[] = [{ id: "root", label: "Root" }];

		const zone =
			selector.zone === undefined || selector.zone === "default-zone"
				? data.content
				: data.zones?.[selector.zone];
		if (zone === undefined) {
			return chain;
		}

		const item = zone[selector.index];
		if (item === undefined) {
			return chain;
		}
		chain.push({
			id: String(
				item.props?.id ?? `${selector.zone ?? "root"}:${selector.index}`,
			),
			label: item.type,
		});
		return chain;
	}, [selector, data]);
}
