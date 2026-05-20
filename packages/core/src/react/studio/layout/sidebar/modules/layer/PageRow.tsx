/**
 * @file Single row in the Pages panel (PRD §6.4; plan 0004 P2).
 *
 * Extracted from the inline component previously declared inside
 * `PagesPanel.tsx`. Visual + a11y contract preserved verbatim — only
 * the file location changed in this task. Capability-gated row
 * actions land in later P2 tasks.
 */

import { Globe, Home } from "lucide-react";
import type { ReactNode } from "react";
import { Item, ItemMedia } from "@/primitives/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import type { StudioPage } from "@/types/pages";
import { cn } from "@/utils/cn";

export interface PageRowProps {
	readonly page: StudioPage;
	readonly onSelect: (id: string) => void;
	readonly routeBadgeLabel: string;
}

export function PageRow({
	page,
	onSelect,
	routeBadgeLabel,
}: PageRowProps): ReactNode {
	const label = page.title.length > 0 ? page.title : (page.path ?? page.id);
	const isHome = page.id === "home" || label.toLowerCase() === "home";
	return (
		<li role="listitem">
			<Item
				size="xs"
				render={
					<button
						type="button"
						onClick={() => onSelect(page.id)}
						aria-current={page.active === true ? "page" : undefined}
						data-active={page.active === true ? "true" : undefined}
						data-testid={`ak-layer-page-row-${page.id}`}
					/>
				}
				className={cn(
					"h-6 gap-2 rounded-sm border-0 px-2 py-0 text-left text-xs font-normal",
					"text-[var(--ak-pages-fg,var(--ak-studio-fg))]",
					"hover:bg-[var(--ak-pages-muted,var(--ak-studio-muted))]",
					"focus-visible:ring-2 focus-visible:ring-[var(--ak-pages-ring,var(--ak-studio-ring))]",
					"data-[active=true]:bg-[var(--ak-pages-muted,var(--ak-studio-muted))] data-[active=true]:text-[var(--ak-pages-fg,var(--ak-studio-fg))]",
				)}
			>
				<ItemMedia
					variant="icon"
					className="text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))]"
				>
					{isHome ? (
						<Home className="size-3.5" aria-hidden="true" />
					) : page.route === true ? (
						<Tooltip>
							<TooltipTrigger
								render={
									<span className="inline-flex">
										<Globe className="size-3.5" aria-label={routeBadgeLabel} />
									</span>
								}
							/>
							<TooltipContent>{routeBadgeLabel}</TooltipContent>
						</Tooltip>
					) : (
						<span className="size-3.5" aria-hidden="true" />
					)}
				</ItemMedia>
				<span className="min-w-0 flex-1 truncate">{label}</span>
			</Item>
		</li>
	);
}
