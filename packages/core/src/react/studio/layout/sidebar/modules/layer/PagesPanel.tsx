/**
 * @file `layer/pages` sub-panel (PRD §6.4).
 *
 * Renders the host's page list above the layer outline. Pulls the list
 * from {@link useStudioPagesSource}; route rows show the globe badge
 * keyed `studio.module.layer.pages.routeBadge`. The "+" header button
 * opens the {@link AddPageDialog}.
 *
 * When the host passes no `pages` prop the panel renders a synthetic
 * default "Home" page (via {@link useStudioPagesSourceOrDefault}) rather
 * than an empty state. The `studio.module.layer.pages.empty` empty state
 * is still shown when a real source returns an empty list.
 */

import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useStudioPagesSourceOrDefault } from "@/context/pages-source";
import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { Windowed } from "@/primitives/windowed";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { StudioPage } from "@/types/pages";
import { AddPageDialog } from "./AddPageDialog";
import { PageRow } from "./PageRow";
import "./pages-tokens.css";
import { usePagesDnd } from "./use-pages-dnd";
import { useSourceList } from "./use-source-list";

export function PagesPanel(): ReactNode {
	const msg = useMsg();
	// Falls back to a synthetic "Home" page when the host passes no
	// `pages` prop, so the panel shows a default row rather than the
	// "No pages yet." empty state. A real but empty source still hits
	// the empty state below.
	const source = useStudioPagesSourceOrDefault();
	// `loading` intentionally ignored — behavior unchanged vs. the prior
	// inline effect; the hook only adds out-of-order protection.
	const { items: pages, error: loadError } = useSourceList<StudioPage>(source);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const handleSelect = useCallback(
		(id: string) => {
			source?.onSelect?.(id);
		},
		[source],
	);

	const trimmedQuery = searchQuery.trim().toLowerCase();
	const filteredPages = useMemo(() => {
		if (trimmedQuery.length === 0) return pages;
		return pages.filter((page) => {
			const title = page.title.toLowerCase();
			const path = (page.path ?? "").toLowerCase();
			return title.includes(trimmedQuery) || path.includes(trimmedQuery);
		});
	}, [pages, trimmedQuery]);

	// Bind the host's source callbacks once per `source` change. These
	// flow to every `PageRow`; binding them inline in the row map would
	// allocate fresh functions each render and re-render every row —
	// defeating the windowing below (see `Windowed` docs).
	const handlers = useMemo(
		() => ({
			onRename: source?.onRename?.bind(source),
			onDelete: source?.onDelete?.bind(source),
			onDuplicate: source?.onDuplicate?.bind(source),
			onUpdateSettings: source?.onUpdateSettings?.bind(source),
			onReorder: source?.onReorder?.bind(source),
		}),
		[source],
	);
	const dnd = usePagesDnd({
		pages: filteredPages,
		onReorder: handlers.onReorder,
	});
	const sortableIds = useMemo(
		() => filteredPages.map((page) => page.id),
		[filteredPages],
	);

	const routeBadgeLabel = msg("studio.module.layer.pages.routeBadge");
	// `useCallback`-stable per the `Windowed` contract.
	const renderPageRow = useCallback(
		(page: StudioPage): ReactNode => (
			<PageRow
				page={page}
				onSelect={handleSelect}
				routeBadgeLabel={routeBadgeLabel}
				onRename={handlers.onRename}
				onDelete={handlers.onDelete}
				onDuplicate={handlers.onDuplicate}
				onUpdateSettings={handlers.onUpdateSettings}
				onReorder={handlers.onReorder}
			/>
		),
		[handleSelect, routeBadgeLabel, handlers],
	);
	const pageKey = useCallback((page: StudioPage): string => page.id, []);

	return (
		<div
			className="ak-pages-panel flex shrink-0 flex-col border-b border-[var(--ak-studio-border)]"
			data-testid="ak-layer-pages"
		>
			<div className="flex h-10 shrink-0 items-center justify-center gap-1 px-2 border-b border-[var(--ak-studio-border)]">
				<h3 className="grow truncate text-sm font-medium text-[var(--ak-studio-fg)]">
					{msg("studio.module.layer.pages.title")}
				</h3>
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									size="icon-xs"
									variant="ghost"
									aria-label={msg("studio.module.layer.pages.add")}
									onClick={() => setDialogOpen(true)}
									data-testid="ak-layer-pages-add"
									className="text-[var(--ak-studio-muted-fg)] hover:bg-[var(--ak-studio-muted)] hover:text-[var(--ak-studio-fg)]"
								>
									<Plus aria-hidden="true" />
								</Button>
							</span>
						}
					/>
					<TooltipContent>
						{msg("studio.module.layer.pages.add")}
					</TooltipContent>
				</Tooltip>
			</div>
			{!loadError && pages.length > 0 ? (
				<div className="px-2 pt-2">
					<Input
						type="search"
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder={msg("studio.module.layer.pages.search.placeholder")}
						aria-label={msg("studio.module.layer.pages.search.placeholder")}
						data-testid="ak-layer-pages-search"
						className="h-7 text-xs"
					/>
				</div>
			) : null}
			<div className="max-h-52 min-h-0 overflow-auto py-3">
				{loadError ? (
					<EmptyState
						message={msg("studio.module.layer.pages.error")}
						testId="ak-layer-pages-error"
					/>
				) : pages.length === 0 ? (
					<EmptyState
						message={msg("studio.module.layer.pages.empty")}
						testId="ak-layer-pages-empty"
					/>
				) : filteredPages.length === 0 ? (
					<EmptyState
						message={msg("studio.module.layer.pages.search.empty")}
						testId="ak-layer-pages-search-empty"
					/>
				) : (
					<DndContext
						sensors={dnd.sensors}
						onDragStart={dnd.handleDragStart}
						onDragEnd={dnd.handleDragEnd}
						onDragCancel={dnd.handleDragCancel}
						accessibility={{
							screenReaderInstructions: {
								draggable: msg("studio.module.layer.pages.tree.instructions"),
							},
							announcements: {
								onDragStart: ({ active }) =>
									`${msg("studio.module.layer.pages.tree.announce.start")} ${String(active.id)}`,
								onDragOver: () => "",
								onDragEnd: ({ active }) =>
									`${msg("studio.module.layer.pages.tree.announce.moved")} ${String(active.id)}`,
								onDragCancel: () =>
									msg("studio.module.layer.pages.tree.announce.cancelled"),
							},
						}}
					>
						<SortableContext
							items={sortableIds}
							strategy={verticalListSortingStrategy}
						>
							<ul role="list" className="flex flex-col px-2 gap-0">
								{/*
								 * Below 50 pages `Windowed` emits bare keyed fragments
								 * (DOM byte-identical to the old `.map`); at/above 50 it
								 * swaps in a virtualized scroll viewport so DOM node count
								 * stays bounded. `maxHeight` matches the `max-h-52` (208px)
								 * outer scroller so the two don't double-scroll.
								 */}
								<Windowed
									items={filteredPages}
									itemKey={pageKey}
									renderItem={renderPageRow}
									estimateSize={24}
									maxHeight={208}
									data-testid="ak-layer-pages-virtualized"
								/>
							</ul>
						</SortableContext>
						<DragOverlay>
							{dnd.activePage !== null ? (
								<div
									className="ak-pages-panel flex h-6 items-center gap-2 rounded-sm bg-[var(--ak-pages-muted,var(--ak-studio-muted))] px-2 text-xs text-[var(--ak-pages-fg,var(--ak-studio-fg))] shadow-lg ring-1 ring-[var(--ak-pages-ring,var(--ak-studio-ring))]"
									data-testid="ak-layer-pages-drag-overlay"
								>
									{dnd.activePage.title.length > 0
										? dnd.activePage.title
										: (dnd.activePage.path ?? dnd.activePage.id)}
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
				)}
			</div>
			<AddPageDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</div>
	);
}
