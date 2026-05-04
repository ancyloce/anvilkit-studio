/**
 * @file `layer/pages` sub-panel (PRD §6.4).
 *
 * Renders the host's page list above the splitter inside the `layer`
 * module. Pulls the list from {@link useStudioPagesSource}; route rows
 * show the globe badge keyed `studio.module.layer.pages.routeBadge`.
 * The "+" header button opens the {@link AddPageDialog}.
 *
 * Empty state (no source registered or empty list) renders the
 * `studio.module.layer.pages.empty` message via the shared
 * {@link EmptyState}.
 */

import { Globe, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import type { StudioPage } from "../../../../../../types/pages.js";
import { cn } from "../../../../../overrides/utils/cn.js";
import { useStudioPagesSource } from "../../../../context/pages-source.js";
import { Button } from "../../../../primitives/button.js";
import { ScrollArea } from "../../../../primitives/scroll-area.js";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../../../../primitives/tooltip.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";
import { EmptyState } from "../../shared/EmptyState.js";
import { AddPageDialog } from "./AddPageDialog.js";

export function PagesPanel(): ReactNode {
	const msg = useMsg();
	const source = useStudioPagesSource();
	const [pages, setPages] = useState<readonly StudioPage[]>([]);
	const [dialogOpen, setDialogOpen] = useState(false);

	useEffect(() => {
		if (source === undefined) {
			setPages([]);
			return;
		}
		let cancelled = false;
		const refresh = (): void => {
			const result = source.list();
			if (result instanceof Promise) {
				void result.then((next) => {
					if (!cancelled) setPages(next);
				});
			} else {
				setPages(result);
			}
		};
		refresh();
		const unsubscribe = source.subscribe?.(refresh);
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [source]);

	const handleSelect = useCallback(
		(id: string) => {
			source?.onSelect?.(id);
		},
		[source],
	);

	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="ak-layer-pages">
			<div className="flex shrink-0 items-center justify-between border-b border-[var(--ak-studio-border)] px-2 py-1.5">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
					{msg("studio.module.layer.pages.title")}
				</h3>
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex">
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={msg("studio.module.layer.pages.add")}
									onClick={() => setDialogOpen(true)}
									data-testid="ak-layer-pages-add"
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
			<div className="min-h-0 flex-1">
				{pages.length === 0 ? (
					<EmptyState
						message={msg("studio.module.layer.pages.empty")}
						testId="ak-layer-pages-empty"
					/>
				) : (
					<ScrollArea>
						<div className="px-1 py-1">
							<ul role="list" className="flex flex-col gap-0.5">
								{pages.map((page) => (
									<PageRow
										key={page.id}
										page={page}
										onSelect={handleSelect}
										routeBadgeLabel={msg(
											"studio.module.layer.pages.routeBadge",
										)}
									/>
								))}
							</ul>
						</div>
					</ScrollArea>
				)}
			</div>
			<AddPageDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</div>
	);
}

interface PageRowProps {
	readonly page: StudioPage;
	readonly onSelect: (id: string) => void;
	readonly routeBadgeLabel: string;
}

function PageRow({ page, onSelect, routeBadgeLabel }: PageRowProps): ReactNode {
	const label = page.title.length > 0 ? page.title : (page.path ?? page.id);
	return (
		<li role="listitem">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onSelect(page.id)}
				aria-current={page.active === true ? "page" : undefined}
				data-active={page.active === true ? "true" : undefined}
				data-testid={`ak-layer-page-row-${page.id}`}
				className={cn(
					"h-auto w-full justify-start gap-2 rounded-sm px-2 py-1 text-left text-sm font-normal",
					"text-[var(--ak-studio-fg)] outline-none",
					"hover:bg-[var(--ak-studio-muted)]",
					"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
					"data-[active=true]:bg-[var(--ak-studio-accent)] data-[active=true]:text-[var(--ak-studio-accent-fg)]",
				)}
			>
				<span className="min-w-0 flex-1 truncate">{label}</span>
				{page.route === true ? (
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="inline-flex">
									<Globe
										className="size-3.5 shrink-0 text-[var(--ak-studio-muted-fg)]"
										aria-label={routeBadgeLabel}
									/>
								</span>
							}
						/>
						<TooltipContent>{routeBadgeLabel}</TooltipContent>
					</Tooltip>
				) : null}
			</Button>
		</li>
	);
}
