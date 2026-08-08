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
import { type ReactNode, use, useState } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/primitives/tabs";
import { useMsg } from "@/state/editor-i18n-context";
import { COMPONENTS_PANEL } from "../components/ComponentsPanel.js";
import { VARIANTS_PANEL } from "../components/VariantAxisEditor.js";
import { EditorSelectionBinder } from "../selection-binder.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { CompositionCanvas } from "./CompositionCanvas.js";
import { DATA_PANEL } from "./DataPanel.js";
import { DESIGN_SYSTEM_PANEL } from "./DesignSystemPanel.js";
import { INTERACTIONS_PANEL } from "./InteractionsPanel.js";
import type { StudioInspectorPanel } from "./inspector-panel.js";
import { STYLE_PANEL } from "./StylePanel.js";
import { TokenModeProvider } from "./token-mode.js";
import { useViewportWriteLayer, WriteLayerProvider } from "./write-layer.js";

// Re-exported so `StudioInspectorPanel` stays importable from the
// layout, its historical home, while the declaration lives in a leaf
// module both the layout and the panels can depend on without a cycle.
export type { StudioInspectorPanel };

/** The Properties tab: always present, always first (§8.1 sketch). */
const PROPERTIES_TAB_ID = "properties";

/**
 * The default inspector roster (`p4-009`).
 *
 * Populated from the panels' own exported entries, so adding a panel
 * never means editing this file *and* that one. Order is the authoring
 * order an editor reads top-to-bottom: what it looks like (Style),
 * what feeds it (Data), what it does (Interactions), then the two
 * document-wide systems those three resolve against — the component
 * library and its variants (`p5-006`) and the design system.
 *
 * Components and Variants are in the default roster rather than
 * opt-in: PLAN-0026 §3.8.3's whole point is that a shell which cannot
 * reach the component library ships *less* than what it replaces, and
 * `root.props.componentLibrary` would be a declared prop with no
 * product behind it.
 *
 * A host may pass its own `panels` to replace this wholesale — the
 * roster is a prop, not hard-coded chrome.
 */
export const DEFAULT_INSPECTOR_PANELS: readonly StudioInspectorPanel[] =
	Object.freeze([
		STYLE_PANEL,
		DATA_PANEL,
		INTERACTIONS_PANEL,
		COMPONENTS_PANEL,
		VARIANTS_PANEL,
		DESIGN_SYSTEM_PANEL,
	]);

export interface StudioPuckLayoutProps {
	/**
	 * Inspector tabs after Properties, in display order. Defaults to
	 * {@link DEFAULT_INSPECTOR_PANELS}; pass `[]` for a bare shell. Ids
	 * must be unique and not `"properties"`.
	 */
	readonly panels?: readonly StudioInspectorPanel[];
}

/**
 * The composition Studio shell. Must be rendered as a child of
 * `<Puck>` — every region below is a Puck composition component and
 * throws outside that boundary.
 */
export function StudioPuckLayout({
	panels = DEFAULT_INSPECTOR_PANELS,
}: StudioPuckLayoutProps): ReactNode {
	const msg = useMsg();
	// The Puck→Core selection feed. It is mounted HERE rather than left
	// where it is today (`react/components/use-studio-controller.ts:935`,
	// inside the `puck` override slot) because `p4-009` deletes the
	// overrides shell: a feed that only exists in the surface being
	// removed would take canvas→inspector selection with it, and the
	// failure would look like a selection bug rather than a missing
	// mount. `null` when the editor feature is off, in which case there
	// is no controller to feed and the shell still renders.
	const bridge = use(StudioEditorBridgeContext);
	// Drive the shell write layer off the viewport controller rather
	// than shell-local state. The canvas overlay renders outside
	// `<Puck>` and cannot see this context, so it reads the layer via
	// `bridge.responsive` — a shell-local value would make the panels a
	// SECOND source that could disagree with the canvas. Controlled off
	// the one controller both sides already see, they cannot.
	const writeLayer = useViewportWriteLayer();
	const [tab, setTab] = useState<string>(PROPERTIES_TAB_ID);
	// A removed panel (host recompiles its plugin set) must not leave
	// the inspector on a dead tab.
	const activeTab =
		tab === PROPERTIES_TAB_ID || panels.some((panel) => panel.id === tab)
			? tab
			: PROPERTIES_TAB_ID;

	return (
		// ONE write layer for the whole shell, controlled off the viewport
		// controller. Every panel in the roster renders beneath this
		// provider and the canvas reads the same controller through the
		// bridge, so "which breakpoint am I authoring into" cannot be
		// answered two different ways — the defect class `p4-004` exists
		// to prevent structurally rather than by convention. With no
		// editor bridge the layer is `undefined`, which leaves the
		// provider uncontrolled and authoring goes to `base`.
		<WriteLayerProvider
			layer={writeLayer.layer}
			onLayerChange={writeLayer.setLayer}
		>
			{/* ONE previewed token mode for the whole shell (`p5-007`).
			    The Design System panel writes it and the canvas compiles
			    against it, and they are in different columns — so the value
			    has to live above both. Uncontrolled: the shell starts on the
			    document's own `defaultTokenMode`, which is what `undefined`
			    means to `compileDocumentAppearance`. */}
			<TokenModeProvider>
				<div
					className="flex h-full min-h-0 w-full"
					data-testid="ak-studio-puck-layout"
				>
					{bridge === null ? null : <EditorSelectionBinder bridge={bridge} />}
					<aside
						className="flex w-60 shrink-0 flex-col overflow-auto border-r border-[var(--ak-studio-border)]"
						data-testid="ak-composition-sidebar"
					>
						<Puck.Components />
						<Puck.Outline />
					</aside>

					<CompositionCanvas />

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
			</TokenModeProvider>
		</WriteLayerProvider>
	);
}
