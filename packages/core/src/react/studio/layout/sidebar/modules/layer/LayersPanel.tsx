/**
 * @file `layer/layers` sub-panel (PRD §6.5).
 *
 * Hosts `<Puck.Outline />` inside a `<ScrollArea>` and adds the
 * surrounding header + "+" quick-add affordance. The popover lists:
 *
 * 1. Built-in primitives (`Layout`, `Row`, `Column`, `Text`) — only
 *    rendered when the host's `puckConfig.components` actually has a
 *    matching key. Default inserters dispatch a Puck `insert` action
 *    at the root.
 * 2. Plugin-contributed entries from `sidebar-registry-store.layerQuickAdds`,
 *    sorted by `order` then `id`.
 *
 * Empty state: when no pages source is registered, or no page is
 * marked `active === true`, render `studio.module.layer.layers.empty`
 * and skip the outline (PRD §6.7).
 */

import { Puck, useGetPuck } from "@puckeditor/core";
import {
	Columns,
	LayoutGrid,
	Plus,
	Rows,
	Type,
	type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import type {
  StudioLayerQuickAdd,
  StudioLayerQuickAddInserter,
} from "../../../../../../types/sidebar";
import type { StudioPage } from "../../../../../../types/pages";
import { useStudioPagesSource } from "../../../../context/pages-source";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../primitives/dropdown-menu";
import { Button } from "../../../../primitives/button";
import { ScrollArea } from "../../../../primitives/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../primitives/tooltip";
import { useMsg } from "../../../../state/editor-i18n-store";
import { useSidebarRegistry } from "../../../../state/sidebar-registry-store-react";
import { EmptyState } from "../../shared/EmptyState";

interface BuiltInQuickAdd {
	readonly id: string;
	readonly componentName: string;
	readonly labelKey: string;
	readonly icon: LucideIcon;
}

const BUILT_IN_QUICK_ADDS: readonly BuiltInQuickAdd[] = [
	{
		id: "layout",
		componentName: "Layout",
		labelKey: "studio.module.layer.layers.add.layout",
		icon: LayoutGrid,
	},
	{
		id: "row",
		componentName: "Row",
		labelKey: "studio.module.layer.layers.add.row",
		icon: Rows,
	},
	{
		id: "column",
		componentName: "Column",
		labelKey: "studio.module.layer.layers.add.column",
		icon: Columns,
	},
	{
		id: "text",
		componentName: "Text",
		labelKey: "studio.module.layer.layers.add.text",
		icon: Type,
	},
];

interface ResolvedQuickAdd {
	readonly id: string;
	readonly label: string;
	readonly icon: ReactNode;
	readonly run: () => void | Promise<void>;
}

export function LayersPanel(): ReactNode {
	const msg = useMsg();
	const source = useStudioPagesSource();
	const [pages, setPages] = useState<readonly StudioPage[]>([]);
	const getPuck = useGetPuck();

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

	const hasActivePage = pages.some((page) => page.active === true);
	const hasNoSource = source === undefined;

	const pluginQuickAdds = useSidebarRegistry((state) => state.layerQuickAdds);

	const quickAdds = useMemo<readonly ResolvedQuickAdd[]>(() => {
		const snapshot = getPuck();
		const componentNames = Object.keys(snapshot.config.components ?? {});
		const componentSet = new Set(componentNames);

		const builtInEntries: ResolvedQuickAdd[] = [];
		for (const entry of BUILT_IN_QUICK_ADDS) {
			if (!componentSet.has(entry.componentName)) continue;
			const Icon = entry.icon;
			builtInEntries.push({
				id: `builtin:${entry.id}`,
				label: msg(entry.labelKey),
				icon: <Icon className="size-4" aria-hidden="true" />,
				run: () => {
					const liveSnapshot = getPuck();
					// Default insert: append to root's default zone. Puck
					// validates the action shape and rejects unknown
					// component types — so the `componentSet` filter above
					// is also our brand-safety check before dispatch.
					liveSnapshot.dispatch({
						type: "insert",
						componentType: entry.componentName,
						destinationIndex: liveSnapshot.appState.data.content.length,
						destinationZone: "default-zone",
					});
				},
			});
		}

		const pluginEntries: ResolvedQuickAdd[] = [];
		const sortedPlugins = [...pluginQuickAdds.values()].sort(
			(a: StudioLayerQuickAdd, b: StudioLayerQuickAdd) => {
				const ao = a.order ?? 100;
				const bo = b.order ?? 100;
				if (ao !== bo) return ao - bo;
				return a.id.localeCompare(b.id);
			},
		);
		for (const entry of sortedPlugins) {
			const insert: StudioLayerQuickAddInserter = entry.insert;
			pluginEntries.push({
				id: `plugin:${entry.id}`,
				label: msg(entry.labelKey),
				icon: null,
				run: () => {
					const liveSnapshot = getPuck();
					return insert({
						puckApi: liveSnapshot,
						currentSelection: liveSnapshot.selectedItem ?? null,
					});
				},
			});
		}

		return [...builtInEntries, ...pluginEntries];
	}, [getPuck, msg, pluginQuickAdds]);

	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="ak-layer-layers">
			<div className="flex shrink-0 items-center justify-between border-b border-[var(--ak-studio-border)] px-2 py-1.5">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ak-studio-muted-fg)]">
					{msg("studio.module.layer.layers.title")}
				</h3>
				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger
							render={
								<span className="inline-flex">
									<DropdownMenuTrigger
										render={
											<Button
												size="icon-sm"
												variant="ghost"
												aria-label={msg("studio.module.layer.layers.add")}
												data-testid="ak-layer-layers-add"
											/>
										}
									>
										<Plus aria-hidden="true" />
									</DropdownMenuTrigger>
								</span>
							}
						/>
						<TooltipContent>
							{msg("studio.module.layer.layers.add")}
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent
						align="end"
						sideOffset={4}
						data-testid="ak-layer-quickadd-popup"
					>
						{quickAdds.length === 0 ? (
							<div className="px-2 py-1.5 text-xs text-muted-foreground">
								{msg("studio.module.layer.layers.empty")}
							</div>
						) : (
							quickAdds.map((entry) => (
								<DropdownMenuItem
									key={entry.id}
									onClick={() => {
										void entry.run();
									}}
									data-testid={`ak-layer-quickadd-${entry.id}`}
								>
									{entry.icon}
									<span>{entry.label}</span>
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div className="min-h-0 flex-1">
				{hasNoSource || !hasActivePage ? (
					<EmptyState
						message={msg("studio.module.layer.layers.empty")}
						testId="ak-layer-layers-empty"
					/>
				) : (
					<ScrollArea>
						<div className="px-1 py-2">
							<Puck.Outline />
						</div>
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
