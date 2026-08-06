"use client";

/**
 * @file `StudioPuckLayout` — the composition-based Studio shell
 * (PLAN-0025 §8.1, P2-01).
 *
 * Renders INSIDE `<Puck>` and assembles the editor from Puck's public
 * composition components only: `Puck.Components` + `Puck.Outline` in
 * the left sidebar, `Puck.Preview` as the canvas, and an inspector
 * whose Properties tab is `Puck.Fields` — returned to Puck in full,
 * with no `FieldsPanel` override parsing `children.fieldName`,
 * `isLoading`, or `itemSelector` (§3.5's exposure ends here).
 *
 * Later Phase 2 tasks plug StylePanel/DataPanel/InteractionPanel in
 * through {@link StudioInspectorPanel} entries; the shell itself knows
 * nothing about appearance, commands, or the compiler.
 *
 * The active tab is editor-UI-only state (§4.1): plain local state,
 * never Puck Data, never a history entry. Labels come from the
 * existing `studio.editor.inspector.*` catalog keys — `useMsg` falls
 * back to the default English catalog when no i18n provider is
 * mounted, so the shell works under a bare `<Puck>` too.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode, useState } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/primitives/tabs";
import { useMsg } from "@/state/editor-i18n-context";

/**
 * One pluggable inspector tab. `labelKey` is a `studio.*` catalog key
 * (inline strings are prohibited — the catalog owns all four locales).
 */
export interface StudioInspectorPanel {
	readonly id: string;
	readonly labelKey: string;
	readonly render: () => ReactNode;
}

/** The Properties tab: always present, always first (§8.1 sketch). */
const PROPERTIES_TAB_ID = "properties";

export interface StudioPuckLayoutProps {
	/**
	 * Inspector tabs after Properties, in display order (StylePanel and
	 * friends — P2-02+). Ids must be unique and not `"properties"`.
	 */
	readonly panels?: readonly StudioInspectorPanel[];
}

/**
 * The composition Studio shell. Must be rendered as a child of
 * `<Puck>` — every region below is a Puck composition component and
 * throws outside that boundary.
 */
export function StudioPuckLayout({
	panels = [],
}: StudioPuckLayoutProps): ReactNode {
	const msg = useMsg();
	const [tab, setTab] = useState<string>(PROPERTIES_TAB_ID);
	// A removed panel (host recompiles its plugin set) must not leave
	// the inspector on a dead tab.
	const activeTab =
		tab === PROPERTIES_TAB_ID || panels.some((panel) => panel.id === tab)
			? tab
			: PROPERTIES_TAB_ID;

	return (
		<div
			className="flex h-full min-h-0 w-full"
			data-testid="ak-studio-puck-layout"
		>
			<aside
				className="flex w-60 shrink-0 flex-col overflow-auto border-r border-[var(--ak-studio-border)]"
				data-testid="ak-composition-sidebar"
			>
				<Puck.Components />
				<Puck.Outline />
			</aside>

			<main
				className="min-w-0 flex-1 overflow-auto"
				data-testid="ak-composition-canvas"
			>
				<Puck.Preview />
			</main>

			<aside
				className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-[var(--ak-studio-border)]"
				data-testid="ak-composition-inspector"
			>
				<Tabs
					value={activeTab}
					onValueChange={(next) => {
						if (typeof next === "string") setTab(next);
					}}
					className="flex min-h-0 flex-1 flex-col gap-0"
				>
					<TabsList
						aria-label={msg("studio.editor.inspector.tabs.label")}
						data-testid="ak-composition-inspector-tabs"
						className="h-9 w-full shrink-0 rounded-none border-b border-[var(--ak-studio-border)] bg-transparent px-2 py-[3px]"
					>
						<TabsTab
							value={PROPERTIES_TAB_ID}
							data-testid="ak-composition-tab-properties"
							className="px-1 text-[12px] font-medium"
						>
							{msg("studio.editor.inspector.tab.properties")}
						</TabsTab>
						{panels.map((panel) => (
							<TabsTab
								key={panel.id}
								value={panel.id}
								data-testid={`ak-composition-tab-${panel.id}`}
								className="px-1 text-[12px] font-medium"
							>
								{msg(panel.labelKey)}
							</TabsTab>
						))}
					</TabsList>
					{/* One scroll region for whichever panel is active; inactive
					    panels stay unmounted (no keepMounted) so they neither
					    subscribe to PuckApi nor get announced. */}
					<div className="min-h-0 flex-1 overflow-auto">
						<TabsPanel
							value={PROPERTIES_TAB_ID}
							data-testid="ak-composition-panel-properties"
							layout={false}
							transition={{ duration: 0 }}
							className="flex flex-col gap-3 px-3 py-2"
						>
							<Puck.Fields />
						</TabsPanel>
						{panels.map((panel) => (
							<TabsPanel
								key={panel.id}
								value={panel.id}
								data-testid={`ak-composition-panel-${panel.id}`}
								layout={false}
								transition={{ duration: 0 }}
								className="flex flex-col gap-3 px-3 py-2"
							>
								{activeTab === panel.id ? panel.render() : null}
							</TabsPanel>
						))}
					</div>
				</Tabs>
			</aside>
		</div>
	);
}
