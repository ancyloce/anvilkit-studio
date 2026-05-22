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
 * When the host passes no pages source, a synthetic active "Home" page
 * stands in (via {@link useStudioPagesSourceOrDefault}) so the outline
 * renders by default. The `studio.module.layer.layers.empty` empty state
 * still shows when a real source has pages but none marked
 * `active === true` (PRD §6.7).
 */

import { useGetPuck } from "@puckeditor/core";
import {
	Columns,
	LayoutGrid,
	type LucideIcon,
	Plus,
	Rows,
	Type,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useStudioPagesSourceOrDefault } from "@/context/pages-source";
import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { Button } from "@/primitives/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/primitives/dropdown-menu";
import { ScrollArea } from "@/primitives/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import { useSidebarRegistry } from "@/state/sidebar-registry-store-react";
import type { StudioPage } from "@/types/pages";
import type {
	StudioLayerQuickAdd,
	StudioLayerQuickAddInserter,
} from "@/types/sidebar";
import { LayerTree } from "./LayerTree";
import { useSourceList } from "./use-source-list";

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
	// Falls back to a synthetic active "Home" page when the host passes
	// no `pages` prop, so the outline renders by default instead of the
	// "Select a page to see its layers." empty state. A real source with
	// no active page still hits that empty state via `!hasActivePage`.
	const source = useStudioPagesSourceOrDefault();
	// `loading` intentionally ignored — behavior unchanged vs. the prior
	// inline effect; the hook only adds out-of-order protection.
	const { items: pages, error: loadError } = useSourceList<StudioPage>(source);
	const getPuck = useGetPuck();

	const hasActivePage = pages.some((page) => page.active === true);

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
						// Puck's compound root-zone key is `root:default-zone`;
						// the bare `default-zone` misses `state.indexes.zones`
						// / `walkAppState` keys and the insert silently no-ops.
						destinationZone: "root:default-zone",
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
		<div className="flex min-h-0 flex-1 flex-col" data-testid="ak-layer-layers">
			<div className="flex h-10 shrink-0 items-center justify-center gap-1 px-2 border-b border-[var(--ak-studio-border)]">
				<h3 className="grow truncate text-sm font-medium text-[var(--ak-studio-fg)]">
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
												size="icon-xs"
												variant="ghost"
												aria-label={msg("studio.module.layer.layers.add")}
												data-testid="ak-layer-layers-add"
												className="text-[var(--ak-studio-muted-fg)] hover:bg-[var(--ak-studio-muted)] hover:text-[var(--ak-studio-fg)]"
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
				{loadError ? (
					<EmptyState
						message={msg("studio.module.layer.layers.error")}
						testId="ak-layer-layers-error"
					/>
				) : !hasActivePage ? (
					<EmptyState
						message={msg("studio.module.layer.layers.empty")}
						testId="ak-layer-layers-empty"
					/>
				) : (
					<ScrollArea>
						<div data-ak-layer-outline className="px-2 py-1">
							<LayerTree />
						</div>
					</ScrollArea>
				)}
			</div>
		</div>
	);
}
