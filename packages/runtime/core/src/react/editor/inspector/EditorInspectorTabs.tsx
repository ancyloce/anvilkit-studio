"use client";

/**
 * @file `EditorInspectorTabs` — the four-tab visual-editor inspector.
 *
 * Replaces the "native fields, then a stack of universal sections
 * appended below" layout with one switchable surface: a compact
 * full-width tab bar pinned under `FieldsPanel`'s breadcrumb/selection
 * header, and exactly one independently scrolling panel below it.
 *
 * ### Tab map
 *
 * | tab          | content                                                    |
 * | ------------ | ---------------------------------------------------------- |
 * | `style`      | layout, visual style, typography, image adjustment          |
 * | `properties` | the native Puck field tree (owned by `FieldsPanel`) + the   |
 * |              | component-instance section                                  |
 * | `data`       | `BindingsSection` (sources, prop/visibility/repeat targets) |
 * | `animation`  | `InteractionsSection` (triggers, actions, timeline)         |
 *
 * The three editor-owned tabs are always present. A component that
 * declares no matching capability gets a localized empty state rather
 * than a vanishing tab — a tab strip whose membership changed per
 * selection would be a moving target for both authors and E2E.
 *
 * ### Why this is not document state
 *
 * The active tab lives in the per-`<Studio>` editor-UI store as a
 * **transient** field (`inspectorTab`, excluded from `partialize`, like
 * `focusMode`). Switching tabs therefore dispatches no editor command,
 * writes nothing through the command port, and records no Puck history
 * entry; the tab survives selection changes inside one mounted Studio
 * and resets to `properties` on the next mount, because
 * `useRehydratedStore` builds a fresh store per mount.
 *
 * ### Mounting
 *
 * Inactive panels are unmounted (no `keepMounted`), so an inactive Data
 * tab issues no preview-data request and inactive panels are neither
 * focusable nor announced. Panel cross-fades run at zero duration —
 * an inspector is a working surface, not a showcase — while the tab
 * bar keeps the shared pill highlight, which `<Studio>`'s
 * `MotionConfig reducedMotion="user"` already stills for authors who
 * ask for reduced motion.
 */

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/primitives/tabs";
import { useMsg } from "@/state/editor-i18n-context";
import { useInspectorTab } from "@/state/slices/editor-ui-selectors";
import {
	INSPECTOR_TABS,
	type InspectorTab,
} from "@/state/slices/editor-ui-store";
import {
	EditorInspectorSections,
	visibleSections,
} from "./EditorInspectorPanel.js";
import type { InspectorSectionCategory } from "./sections-registry.js";
import {
	type EditorInspectorContext,
	useEditorInspector,
} from "./use-inspector.js";

/** The tab strip, in display order, with its catalog keys. */
const TABS: readonly {
	readonly id: InspectorTab;
	readonly labelKey: string;
	/** Sections rendered under this tab (`properties` also gets fields). */
	readonly category: InspectorSectionCategory;
	/** Shown when the tab has nothing to offer this selection. */
	readonly emptyKey?: string;
}[] = [
	{
		id: "style",
		labelKey: "studio.editor.inspector.tab.style",
		category: "style",
		emptyKey: "studio.editor.inspector.tab.style.empty",
	},
	{
		id: "properties",
		labelKey: "studio.editor.inspector.tab.properties",
		category: "properties",
	},
	{
		id: "data",
		labelKey: "studio.editor.inspector.tab.data",
		category: "data",
		emptyKey: "studio.editor.inspector.tab.data.empty",
	},
	{
		id: "animation",
		labelKey: "studio.editor.inspector.tab.animation",
		category: "animation",
		emptyKey: "studio.editor.inspector.tab.animation.empty",
	},
];

function isInspectorTab(value: unknown): value is InspectorTab {
	return (INSPECTOR_TABS as readonly string[]).includes(value as string);
}

/** A tab with nothing to show for the current selection. */
function EmptyTab({
	messageKey,
	testId,
}: {
	readonly messageKey: string;
	readonly testId: string;
}): ReactNode {
	const msg = useMsg();
	return (
		<p
			className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
			data-testid={testId}
		>
			{msg(messageKey)}
		</p>
	);
}

/** One tab's body: its capability-gated sections, or an empty state. */
function TabBody({
	tab,
	context,
	properties,
}: {
	readonly tab: (typeof TABS)[number];
	readonly context: EditorInspectorContext | null;
	readonly properties?: ReactNode;
}): ReactNode {
	const sections =
		context === null ? null : (
			<EditorInspectorSections context={context} category={tab.category} />
		);
	const hasSections =
		context !== null && visibleSections(context, tab.category).length > 0;

	if (tab.id === "properties") {
		// The native field tree is always the properties tab's body, even
		// when the editor contributes no section of its own — Puck owns
		// its loading and empty states, so there is no editor empty state
		// to substitute here.
		return (
			<>
				{properties}
				{sections}
			</>
		);
	}
	if (!hasSections) {
		return (
			<EmptyTab
				messageKey={tab.emptyKey as string}
				testId={`ak-inspector-empty-${tab.id}`}
			/>
		);
	}
	return sections;
}

export interface EditorInspectorTabsProps {
	/** The native Puck field tree, rendered under `properties`. */
	readonly properties?: ReactNode;
}

/** The tabbed inspector body (editor-enabled Studios only). */
export function EditorInspectorTabs({
	properties,
}: EditorInspectorTabsProps): ReactNode {
	const msg = useMsg();
	const [tab, setTab] = useInspectorTab();
	// `null` while the editor runtime is loading or the selection holds
	// no editor node (root-only selection) — the tabs still render, each
	// with its empty state, so the strip never shifts under the author.
	const context = useEditorInspector();

	return (
		<Tabs
			value={tab}
			onValueChange={(next) => {
				if (isInspectorTab(next)) setTab(next);
			}}
			className="flex min-h-0 flex-1 flex-col gap-0"
			data-testid="ak-editor-inspector"
		>
			<TabsList
				aria-label={msg("studio.editor.inspector.tabs.label")}
				data-testid="ak-inspector-tabs"
				className="h-9 w-full shrink-0 rounded-none border-b border-[var(--ak-studio-border)] bg-transparent px-2 py-[3px]"
			>
				{TABS.map((entry) => (
					<TabsTab
						key={entry.id}
						value={entry.id}
						data-testid={`ak-inspector-tab-${entry.id}`}
						className="px-1 text-[12px] font-medium"
					>
						{msg(entry.labelKey)}
					</TabsTab>
				))}
			</TabsList>
			{/*
			 * One scroll region for whichever panel is active — DESIGN.md
			 * §7.8's "only the body scrolls", now scoped per tab so a long
			 * Style tab never scrolls the tab strip out of reach.
			 */}
			<div className="min-h-0 flex-1 overflow-auto">
				{TABS.map((entry) => (
					<TabsPanel
						key={entry.id}
						value={entry.id}
						data-testid={`ak-inspector-panel-${entry.id}`}
						layout={false}
						transition={{ duration: 0 }}
						className="flex flex-col gap-3 px-3 py-2"
					>
						<TabBody tab={entry} context={context} properties={properties} />
					</TabsPanel>
				))}
			</div>
		</Tabs>
	);
}
