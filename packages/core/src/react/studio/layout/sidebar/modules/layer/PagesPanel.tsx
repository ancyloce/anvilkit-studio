/**
 * @file `layer/pages` sub-panel (PRD §6.4).
 *
 * Renders the host's page list above the layer outline. Pulls the list
 * from {@link useStudioPagesSource}; route rows show the globe badge
 * keyed `studio.module.layer.pages.routeBadge`. The "+" header button
 * opens the {@link AddPageDialog}.
 *
 * Empty state (no source registered or empty list) renders the
 * `studio.module.layer.pages.empty` message via the shared
 * {@link EmptyState}.
 */

import { Plus } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { useStudioPagesSource } from "@/context/pages-source";
import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { StudioPage } from "@/types/pages";
import { AddPageDialog } from "./AddPageDialog";
import { PageRow } from "./PageRow";
import "./pages-tokens.css";
import { useSourceList } from "./use-source-list";

export function PagesPanel(): ReactNode {
	const msg = useMsg();
	const source = useStudioPagesSource();
	// `loading` intentionally ignored — behavior unchanged vs. the prior
	// inline effect; the hook only adds out-of-order protection.
	const { items: pages, error: loadError } = useSourceList<StudioPage>(source);
	const [dialogOpen, setDialogOpen] = useState(false);

	const handleSelect = useCallback(
		(id: string) => {
			source?.onSelect?.(id);
		},
		[source],
	);

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
				) : (
					<ul role="list" className="flex flex-col px-2 gap-1">
						{pages.map((page) => (
							<PageRow
								key={page.id}
								page={page}
								onSelect={handleSelect}
								routeBadgeLabel={msg("studio.module.layer.pages.routeBadge")}
								onRename={source?.onRename?.bind(source)}
								onDelete={source?.onDelete?.bind(source)}
								onDuplicate={source?.onDuplicate?.bind(source)}
								onUpdateSettings={source?.onUpdateSettings?.bind(source)}
							/>
						))}
					</ul>
				)}
			</div>
			<AddPageDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</div>
	);
}
