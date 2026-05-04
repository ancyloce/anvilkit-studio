/**
 * @file Snippet body for the `text` module (PRD §8.2 / §8.5).
 *
 * Two render branches:
 *
 *   - `searchTerm` non-empty → flat list of matching snippets, no
 *     section dividers (mirrors `insert` module precedent — PRD §5.4).
 *   - `searchTerm` empty + filter applied → group by category in an
 *     `Accordion`. Built-in categories (`basic`, `brand`) take their
 *     header from i18n; plugin-defined categories render under their
 *     literal category string (PRD §8.3 — catalog ships only basic +
 *     brand keys).
 *
 * The empty state reuses the library-empty copy
 * (`studio.module.text.empty`) for both filter-empty and library-empty
 * results — PRD §10.1 does not ship a separate filter-empty key, and
 * the message is generic enough to read sensibly in both cases.
 */

import { type ReactNode, useMemo } from "react";

import type {
	StudioCopySnippet,
	StudioCopySnippetCategory,
} from "../../../../../../types/sidebar.js";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "../../../../primitives/accordion.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";
import type { CopyCategoryFilter } from "../../../../state/editor-ui-store.js";
import { EmptyState } from "../../shared/EmptyState.js";
import { SnippetRow } from "./SnippetRow.js";

const BUILTIN_CATEGORY_KEYS: Readonly<Record<string, string>> = {
	basic: "studio.module.text.category.basic",
	brand: "studio.module.text.category.brand",
};

export interface SnippetListProps {
	readonly snippets: readonly StudioCopySnippet[];
	readonly categoryFilter: CopyCategoryFilter;
	readonly searchTerm: string;
	readonly disabled: boolean;
	readonly onInsert: (snippet: StudioCopySnippet) => void;
}

function matchesSearch(snippet: StudioCopySnippet, query: string): boolean {
	if (query.length === 0) return true;
	const needle = query.toLowerCase();
	if (snippet.title.toLowerCase().includes(needle)) return true;
	if (snippet.body.toLowerCase().includes(needle)) return true;
	if (snippet.tags?.some((tag: string) => tag.toLowerCase().includes(needle))) return true;
	return false;
}

function matchesCategoryFilter(
	snippet: StudioCopySnippet,
	filter: CopyCategoryFilter,
): boolean {
	if (filter === "all") return true;
	return snippet.category === filter;
}

export function SnippetList({
	snippets,
	categoryFilter,
	searchTerm,
	disabled,
	onInsert,
}: SnippetListProps): ReactNode {
	const msg = useMsg();

	const filtered = useMemo(() => {
		return snippets.filter(
			(s) => matchesCategoryFilter(s, categoryFilter) && matchesSearch(s, searchTerm),
		);
	}, [snippets, categoryFilter, searchTerm]);

	if (filtered.length === 0) {
		return (
			<EmptyState
				message={msg("studio.module.text.empty")}
				testId="ak-text-empty"
			/>
		);
	}

	if (searchTerm.length > 0) {
		return (
			<div
				className="flex flex-col gap-1 p-2"
				data-testid="ak-text-snippet-list-flat"
			>
				{filtered.map((snippet) => (
					<SnippetRow
						key={snippet.id}
						snippet={snippet}
						disabled={disabled}
						onClick={onInsert}
					/>
				))}
			</div>
		);
	}

	const grouped = groupByCategory(filtered);
	const groupIds = grouped.map(([cat]) => cat);

	return (
		<Accordion
			value={groupIds}
			data-testid="ak-text-snippet-list-grouped"
		>
			{grouped.map(([category, list]) => (
				<AccordionItem key={category} value={category}>
					<AccordionTrigger className="min-h-8 px-2 py-1.5">
						<span className="grow truncate">
							{categoryLabel(category, msg)}
						</span>
						<span className="text-[10px] text-muted-foreground">
							{list.length}
						</span>
					</AccordionTrigger>
					<AccordionContent className="p-0">
						<div className="flex flex-col gap-1 p-2">
							{list.map((snippet) => (
								<SnippetRow
									key={snippet.id}
									snippet={snippet}
									disabled={disabled}
									onClick={onInsert}
								/>
							))}
						</div>
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
}

function groupByCategory(
	snippets: readonly StudioCopySnippet[],
): readonly (readonly [StudioCopySnippetCategory, readonly StudioCopySnippet[]])[] {
	const map = new Map<StudioCopySnippetCategory, StudioCopySnippet[]>();
	for (const snippet of snippets) {
		const list = map.get(snippet.category) ?? [];
		list.push(snippet);
		map.set(snippet.category, list);
	}
	return Array.from(map.entries());
}

function categoryLabel(
	category: StudioCopySnippetCategory,
	msg: (key: string) => string,
): string {
	const builtinKey = BUILTIN_CATEGORY_KEYS[category];
	if (builtinKey !== undefined) return msg(builtinKey);
	return category;
}
