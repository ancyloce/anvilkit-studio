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
	Image as ImageIcon,
	Layers as LayersIcon,
	LayoutGrid as LayoutGridIcon,
	Plus as PlusIcon,
	Type as TypeIcon,
} from "lucide-react";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { Tabs, TabsList, TabsTab } from "@/primitives/tabs";
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

		const handleValueChange = useCallback(
      (next: EditorTab | null) => {
        if (next == null) return;
        setActiveTab(next);
        setDrawerCollapsed(false);
      },
      [setActiveTab, setDrawerCollapsed],
    );

		return (
      <div
        ref={containerRef}
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
        <Tabs
          orientation="vertical"
          value={drawerCollapsed ? null : activeTab}
          onValueChange={handleValueChange}
          className="contents"
        >
          <TabsList className="flex h-fit w-fit flex-col items-center justify-start gap-2 rounded-none bg-transparent p-0 text-current">
            {RAIL_MODULES.map(({ key, icon: Icon, labelKey }) => (
              <Tooltip key={key}>
                <TooltipTrigger
                  render={
                    <TabsTab
                      value={key}
                      id={railTabId(key)}
                      aria-controls={SIDEBAR_PANEL_ID}
                      aria-label={msg(labelKey)}
                      onClick={() => {
                        if (key === activeTab && !drawerCollapsed) {
                          setDrawerCollapsed(true);
                        }
                      }}
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
