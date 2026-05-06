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

import { Globe, Home, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useStudioPagesSource } from "@/context/pages-source";
import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { StudioPage } from "@/types/pages";
import { cn } from "@/utils/cn";
import { AddPageDialog } from "./AddPageDialog";

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
		<div
			className="flex shrink-0 flex-col border-b border-[var(--ak-studio-border)]"
			data-testid="ak-layer-pages"
		>
			<div className="flex h-12 shrink-0 items-center justify-between px-4">
				<h3 className="text-sm font-semibold text-[var(--ak-studio-fg)]">
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
			<div className="max-h-52 min-h-0 overflow-auto pb-3">
				{pages.length === 0 ? (
					<EmptyState
						message={msg("studio.module.layer.pages.empty")}
						testId="ak-layer-pages-empty"
					/>
				) : (
					<ul role="list" className="flex flex-col px-4">
						{pages.map((page) => (
							<PageRow
								key={page.id}
								page={page}
								onSelect={handleSelect}
								routeBadgeLabel={msg("studio.module.layer.pages.routeBadge")}
							/>
						))}
					</ul>
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
	const isHome = page.id === "home" || label.toLowerCase() === "home";
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
					"h-6 w-full justify-start gap-2 rounded-sm px-2 py-0 text-left text-xs font-normal",
					"text-[var(--ak-studio-fg)] outline-none",
					"hover:bg-[var(--ak-studio-muted)]",
					"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
					"data-[active=true]:bg-[var(--ak-studio-muted)] data-[active=true]:text-[var(--ak-studio-fg)]",
				)}
			>
				{isHome ? (
					<Home
						className="size-3.5 shrink-0 text-[var(--ak-studio-muted-fg)]"
						aria-hidden="true"
					/>
				) : page.route === true ? (
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
				) : (
					<span className="size-3.5 shrink-0" aria-hidden="true" />
				)}
				<span className="min-w-0 flex-1 truncate">{label}</span>
			</Button>
		</li>
	);
}
