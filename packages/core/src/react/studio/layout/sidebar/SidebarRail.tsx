/**
 * @file Vertical icon rail for the four sidebar modules (PRD §4.1).
 *
 * Renders one 44×44 px shadcn `Button` per module (`insert`, `layer`,
 * `image`, `text`) with the click-active-to-collapse semantics in
 * PRD §3.2: clicking an inactive icon switches modules and expands
 * the panel; clicking the *already-active* icon collapses the panel
 * without changing the active module; clicking any icon while
 * collapsed re-expands to that module.
 *
 * Roving-focus + Arrow / Home / End keyboard navigation per PRD §4.3
 * §12. The rail exposes an imperative `focusActive()` handle so the
 * `SidebarPanel`'s Esc handler can return focus to the active rail
 * tab on collapse.
 */

import {
	Image as ImageIcon,
	Layers as LayersIcon,
	LayoutGrid as LayoutGridIcon,
	Plus as PlusIcon,
	Type as TypeIcon,
} from "lucide-react";
import {
	forwardRef,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import { Button } from "@/primitives/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/primitives/tooltip";
import { useMsg } from "@/state/editor-i18n-store";
import type { EditorTab } from "@/state/editor-ui-store";
import { useActiveTab, useEditorUiStore } from "@/state/hooks";

export const SIDEBAR_PANEL_ID = "ak-sidebar-panel";

export function railTabId(moduleKey: EditorTab): string {
	return `ak-rail-tab-${moduleKey}`;
}

interface RailModule {
	readonly key: EditorTab;
	readonly icon: typeof LayoutGridIcon;
	readonly labelKey: string;
}

const RAIL_MODULES: readonly RailModule[] = [
	{ key: "insert", icon: PlusIcon, labelKey: "studio.module.insert.name" },
	{ key: "layer", icon: LayersIcon, labelKey: "studio.module.layer.name" },
	{ key: "image", icon: ImageIcon, labelKey: "studio.module.image.name" },
	{ key: "text", icon: TypeIcon, labelKey: "studio.module.text.name" },
];

export interface SidebarRailHandle {
	focusActive(): void;
}

export const SidebarRail = forwardRef<SidebarRailHandle>(
	function SidebarRail(_props, ref): ReactNode {
		const msg = useMsg();
		const [activeTab, setActiveTab] = useActiveTab();
		const drawerCollapsed = useEditorUiStore((s) => s.drawerCollapsed);
		const setDrawerCollapsed = useEditorUiStore((s) => s.setDrawerCollapsed);
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

		const activate = useCallback(
			(key: EditorTab) => {
				if (drawerCollapsed) {
					setActiveTab(key);
					setDrawerCollapsed(false);
					return;
				}
				if (key === activeTab) {
					setDrawerCollapsed(true);
					return;
				}
				setActiveTab(key);
			},
			[activeTab, drawerCollapsed, setActiveTab, setDrawerCollapsed],
		);

		const handleKeyDown = useCallback(
			(event: KeyboardEvent<HTMLDivElement>) => {
				const container = containerRef.current;
				if (container === null) return;
				const tabs = Array.from(
					container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
				);
				if (tabs.length === 0) return;
				const currentIndex = tabs.findIndex(
					(el) => el === document.activeElement,
				);
				let nextIndex = currentIndex;
				switch (event.key) {
					case "ArrowDown":
						nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % tabs.length;
						break;
					case "ArrowUp":
						nextIndex =
							currentIndex < 0
								? tabs.length - 1
								: (currentIndex - 1 + tabs.length) % tabs.length;
						break;
					case "Home":
						nextIndex = 0;
						break;
					case "End":
						nextIndex = tabs.length - 1;
						break;
					default:
						return;
				}
				event.preventDefault();
				tabs[nextIndex]?.focus();
			},
			[],
		);

		return (
			<div
				className="flex h-full shrink-0 flex-col items-center gap-2 border-e border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] py-2"
				style={{ inlineSize: "var(--ak-studio-rail-width)" }}
			>
				<div
					role="presentation"
					aria-hidden="true"
					className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<RailBrandMark />
				</div>
				<div
					ref={containerRef}
					role="tablist"
					aria-orientation="vertical"
					onKeyDown={handleKeyDown}
					className="flex flex-col items-center gap-1"
				>
					{RAIL_MODULES.map(({ key, icon: Icon, labelKey }) => {
						const selected = activeTab === key && !drawerCollapsed;
						return (
							<Tooltip key={key}>
								<TooltipTrigger
									render={
										<span className="inline-flex">
											<Button
												id={railTabId(key)}
												role="tab"
												size="icon-lg"
												variant={selected ? "secondary" : "ghost"}
												className="size-11"
												aria-controls={SIDEBAR_PANEL_ID}
												aria-selected={selected}
												aria-label={msg(labelKey)}
												tabIndex={activeTab === key ? 0 : -1}
												onClick={() => activate(key)}
											>
												<Icon aria-hidden="true" />
											</Button>
										</span>
									}
								/>
								<TooltipContent side="right">{msg(labelKey)}</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			</div>
		);
	},
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
