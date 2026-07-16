/**
 * @file `layer` module — Pages & Layers workspace (task Phase 6).
 *
 * Pages and Layers were previously stacked in one flex column (Pages
 * capped at a fixed `max-h-52`, Layers taking the remainder) — DESIGN.md
 * §6 wants "one panel, one mode at a time, one scroll area" instead. A
 * `Tabs` switcher replaces the stack: each mode gets the panel's full
 * height as its own single scroll region, and the active mode persists
 * per Studio instance via `layerPanelMode` (replacing the old, entirely
 * unwired `layerSplitRatio`/`<Splitter>` pair — both removed rather than
 * finished, since a resizable split isn't the right pattern here).
 *
 * `keepMounted` on both panels: dnd-kit sensors, search input state,
 * Pages' multi-selection, and virtualization scroll offset would
 * otherwise reset every time the user switches tabs.
 */

import { type ReactNode } from "react";
import {
	Tabs,
	TabsList,
	TabsPanel,
	TabsPanels,
	TabsTab,
} from "@/primitives/tabs";
import { useMsg } from "@/state/editor-i18n-context";
import { useLayerPanelMode } from "@/state/slices/editor-ui-selectors";
import type { LayerPanelMode } from "@/state/slices/editor-ui-store";
import { LayersPanel } from "./layer/components/LayersPanel";
import { PagesPanel } from "./layer/components/PagesPanel";

function isLayerPanelMode(value: unknown): value is LayerPanelMode {
	return value === "pages" || value === "layers";
}

export function LayerModule(): ReactNode {
	const msg = useMsg();
	const [mode, setMode] = useLayerPanelMode();

	return (
		<Tabs
			value={mode}
			onValueChange={(next) => {
				if (isLayerPanelMode(next)) setMode(next);
			}}
			data-testid="ak-module-layer"
			className="flex h-full min-h-0 w-full flex-col overflow-hidden gap-0"
		>
			<TabsList
				aria-label={msg("studio.module.layer.name")}
				className="w-full shrink-0 rounded-none border-b border-[var(--ak-studio-border)] bg-transparent px-2"
			>
				<TabsTab value="pages" data-testid="ak-layer-tab-pages">
					{msg("studio.module.layer.pages.title")}
				</TabsTab>
				<TabsTab value="layers" data-testid="ak-layer-tab-layers">
					{msg("studio.module.layer.layers.title")}
				</TabsTab>
			</TabsList>
			<TabsPanels className="min-h-0 flex-1">
				<TabsPanel
					value="pages"
					keepMounted
					className="flex h-full min-h-0 flex-col"
				>
					<PagesPanel />
				</TabsPanel>
				<TabsPanel
					value="layers"
					keepMounted
					className="flex h-full min-h-0 flex-col"
				>
					<LayersPanel />
				</TabsPanel>
			</TabsPanels>
		</Tabs>
	);
}
