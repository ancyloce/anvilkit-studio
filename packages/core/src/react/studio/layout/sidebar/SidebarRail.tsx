/**
 * @file Vertical icon rail for the four sidebar modules (PRD §4.1).
 *
 * Built on the animate-ui `Tabs` primitive so role/ARIA, roving focus,
 * and Arrow / Home / End keyboard navigation come from base-ui. The
 * rail keeps the click-active-to-collapse semantics from PRD §3.2:
 * clicking an inactive icon switches modules and expands the panel;
 * clicking the *already-active* icon collapses the panel without
 * changing the active module; clicking any icon while collapsed
 * re-expands to that module.
 *
 * The collapse-on-active-click case relies on base-ui's prop merge
 * order — our `onClick` fires before base-ui's, which short-circuits
 * its `onTabActivation` for an already-active tab. The
 * switch+expand case is handled in `onValueChange`, which only fires
 * when the value actually changes.
 *
 * `focusActive()` is exposed on the imperative handle so the
 * `SidebarPanel`'s Esc handler can return focus to the active rail
 * tab on collapse.
 */

import {
	History as HistoryIcon,
	Image as ImageIcon,
	Layers as LayersIcon,
	LayoutGrid as LayoutGridIcon,
	Palette as PaletteIcon,
	Plus as PlusIcon,
	Sparkles as SparklesIcon,
	Type as TypeIcon,
} from "lucide-react";
import {
	forwardRef,
	type KeyboardEvent,
	memo,
	type ReactNode,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import { useShallow } from "zustand/shallow";
import { Tabs, TabsList, TabsTab } from "@/primitives/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { EditorTab } from "@/state/editor-ui-store";
import { useActiveTab, useEditorUiStore } from "@/state/hooks";
import type { SidebarRegistryState } from "@/state/sidebar-registry-store";
import { useSidebarRegistry } from "@/state/sidebar-registry-store-react";

export const SIDEBAR_PANEL_ID = "ak-sidebar-panel";

export function railTabId(moduleKey: EditorTab): string {
	return `ak-rail-tab-${moduleKey}`;
}

interface RailModule {
	readonly key: EditorTab;
	readonly icon: typeof LayoutGridIcon;
	readonly labelKey: string;
	/**
	 * Predicate over the sidebar registry deciding whether this module's
	 * rail tab is shown. Omitted for the always-visible structural
	 * modules (`insert`, `layer`).
	 */
	readonly isVisible?: (registry: SidebarRegistryState) => boolean;
}

const RAIL_MODULES: readonly RailModule[] = [
	{ key: "insert", icon: PlusIcon, labelKey: "studio.module.insert.name" },
	{ key: "layer", icon: LayersIcon, labelKey: "studio.module.layer.name" },
	{
		key: "image",
		icon: ImageIcon,
		labelKey: "studio.module.image.name",
		isVisible: (s) => s.assetSource !== null,
	},
	{
		key: "text",
		icon: TypeIcon,
		labelKey: "studio.module.text.name",
		isVisible: (s) => s.copyPacks.size > 0,
	},
	{
		key: "copilot",
		icon: SparklesIcon,
		labelKey: "studio.module.copilot.name",
		isVisible: (s) => s.copilotPanel !== null,
	},
	{
		key: "history",
		icon: HistoryIcon,
		labelKey: "studio.module.history.name",
		isVisible: (s) => s.historyPanel !== null,
	},
	{
		key: "design-system",
		icon: PaletteIcon,
		labelKey: "studio.module.designSystem.name",
		isVisible: (s) => s.designSystemPanel !== null,
	},
];

export interface SidebarRailHandle {
	focusActive(): void;
}

export const SidebarRail = memo(
	forwardRef<SidebarRailHandle>(function SidebarRail(_props, ref): ReactNode {
		const msg = useMsg();
		const [activeTab, setActiveTab] = useActiveTab();
		const drawerCollapsed = useEditorUiStore((s) => s.drawerCollapsed);
		const setDrawerCollapsed = useEditorUiStore((s) => s.setDrawerCollapsed);
		// One registry subscription: each module carries its own visibility
		// predicate (always-visible modules omit it). `useShallow` keeps
		// `visibleModules` referentially stable while the visible set is
		// unchanged, since RAIL_MODULES entries have stable identity.
		const visibleModules = useSidebarRegistry(
			useShallow((s) => RAIL_MODULES.filter((m) => m.isVisible?.(s) ?? true)),
		);
		const containerRef = useRef<HTMLDivElement | null>(null);

		useImperativeHandle(
			ref,
			() => ({
				focusActive() {
					const container = containerRef.current;
					if (container === null) return;
					const target = container.querySelector<HTMLButtonElement>(
						`#${railTabId(activeTab)}`,
					);
					target?.focus();
				},
			}),
			[activeTab],
		);

		const handleValueChange = useCallback(
			(next: EditorTab | null) => {
				if (next == null) return;
				setActiveTab(next);
				setDrawerCollapsed(false);
			},
			[setActiveTab, setDrawerCollapsed],
		);

		const handleKeyDown = useCallback(
			(event: KeyboardEvent<HTMLDivElement>) => {
				const container = containerRef.current;
				if (container === null) return;
				const tabs = Array.from(
					container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
				);
				const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
				if (currentIndex === -1) return;

				const lastIndex = tabs.length - 1;
				let nextIndex: number | null = null;
				if (event.key === "ArrowDown") {
					nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
				} else if (event.key === "ArrowUp") {
					nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
				} else if (event.key === "Home") {
					nextIndex = 0;
				} else if (event.key === "End") {
					nextIndex = lastIndex;
				}
				if (nextIndex === null) return;
				event.preventDefault();
				tabs[nextIndex]?.focus();
			},
			[],
		);

		// Collapse-on-active-click (PRD §3.2): clicking the already-active,
		// expanded tab collapses the panel. Stable identity keyed on the
		// rail's own state, not a fresh per-tab closure each render.
		const handleTabClick = useCallback(
			(tabKey: EditorTab): void => {
				if (tabKey === activeTab && !drawerCollapsed) {
					setDrawerCollapsed(true);
				}
			},
			[activeTab, drawerCollapsed, setDrawerCollapsed],
		);

		return (
			<div
				ref={containerRef}
				className="flex h-full shrink-0 flex-col items-center border-e border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)]"
				style={{ inlineSize: "var(--ak-studio-rail-width)" }}
			>
				<div className="flex h-14 w-full shrink-0 items-center justify-center border-b border-[var(--ak-studio-border)]">
					<div
						role="presentation"
						aria-hidden="true"
						className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<RailBrandMark />
					</div>
				</div>
				<Tabs
					orientation="vertical"
					value={drawerCollapsed ? null : activeTab}
					onValueChange={handleValueChange}
					className="contents"
				>
					<TabsList
						className="flex h-fit w-fit flex-col items-center justify-start gap-2 rounded-none bg-transparent p-0 pt-2 text-current"
						onKeyDown={handleKeyDown}
					>
						{visibleModules.map(({ key, icon: Icon, labelKey }) => (
							<Tooltip key={key}>
								<TooltipTrigger
									render={
										<TabsTab
											value={key}
											id={railTabId(key)}
											aria-controls={SIDEBAR_PANEL_ID}
											aria-label={msg(labelKey)}
											onClick={() => handleTabClick(key)}
											className="p-2"
										>
											<Icon aria-hidden="true" />
										</TabsTab>
									}
								/>
								<TooltipContent side="right">{msg(labelKey)}</TooltipContent>
							</Tooltip>
						))}
					</TabsList>
				</Tabs>
			</div>
		);
	}),
);

function RailBrandMark(): ReactNode {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="size-4"
			aria-hidden="true"
		>
			<rect x="4" y="13" width="3" height="7" rx="1" fill="currentColor" />
			<rect x="10.5" y="9" width="3" height="11" rx="1" fill="currentColor" />
			<rect x="17" y="5" width="3" height="15" rx="1" fill="currentColor" />
		</svg>
	);
}
