/**
 * @file `text` module body — Copywriting (PRD §8).
 *
 * Reads `copyPacks` registered via `StudioPluginContext.registerCopySnippetPack`
 * from the per-instance sidebar registry, flattens them into a single
 * snippet list, and renders a filter strip + search + grouped snippet
 * list. Clicking a row replaces the `text` prop on the currently-
 * selected canvas Text element via {@link useInsertSnippet}; rows dim
 * reactively when no compatible selection exists, driven by
 * {@link useTextSelection}.
 *
 * State:
 * - `searchTerm` — local transient string (PRD §9.3 — copy search not
 *   persisted). The {@link TextSearchBar} owns the visible draft and
 *   propagates a debounced 150 ms value.
 * - Filter and accordion grouping are derived inside
 *   {@link SnippetList} — this shell only owns search and composes
 *   children.
 */

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useCopyCategoryFilter } from "@/state/slices/editor-ui-selectors";
import { useSidebarRegistry } from "@/state/sidebar-registry/use-sidebar-registry";
import { useInsertSnippet } from "@/layout/sidebar/commands/use-insert-snippet";
import { useTextSelection } from "@/layout/sidebar/commands/use-text-selection";
import type { StudioCopySnippet, StudioCopySnippetPack } from "@/types/sidebar";
import { SnippetList } from "./text/SnippetList";
import { TextFilterStrip } from "./text/TextFilterStrip";
import { TextSearchBar } from "./text/TextSearchBar";

function flattenPacks(
	packs: ReadonlyMap<string, StudioCopySnippetPack>,
): readonly StudioCopySnippet[] {
	const out: StudioCopySnippet[] = [];
	for (const pack of packs.values()) {
		for (const snippet of pack.snippets) {
			out.push(snippet);
		}
	}
	return out;
}

export function TextModule(): ReactNode {
	const packs = useSidebarRegistry(
		(state): ReadonlyMap<string, StudioCopySnippetPack> => state.copyPacks,
	);
	const [categoryFilter] = useCopyCategoryFilter();
	const [searchTerm, setSearchTerm] = useState("");

	const snippets = useMemo(() => flattenPacks(packs), [packs]);

	const { isCompatibleTextSelection } = useTextSelection();
	const insertSnippet = useInsertSnippet();

	const handleSearch = useCallback((next: string) => {
		setSearchTerm(next);
	}, []);

	return (
		<div data-testid="ak-module-text" className="flex h-full flex-col">
			<div className="flex shrink-0 flex-col gap-2 border-b border-[var(--ak-studio-border)] p-2">
				<TextFilterStrip />
				<TextSearchBar onChange={handleSearch} />
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				<SnippetList
					snippets={snippets}
					categoryFilter={categoryFilter}
					searchTerm={searchTerm}
					disabled={!isCompatibleTextSelection}
					onInsert={insertSnippet}
				/>
			</div>
		</div>
	);
}
