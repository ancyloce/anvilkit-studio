"use client";

/**
 * @file `EditorInspectorPanel` — the universal layout/style/typography
 * inspector body (PLAN-0020 CORE-P1A-005; DD-0019 §11.2;
 * ED-INSPECT-001/002).
 *
 * Reached through `EditorInspectorMount` (the §28 lazy rule: no
 * inspector bytes in the chrome chunk until the editor feature is
 * actually used). Sections are capability-driven: each renders only
 * when at least one selected node's component declares the matching
 * capability, so legacy configs render zero editor UI here.
 *
 * ### Categories, not a second list
 *
 * The tabbed inspector shows one category at a time, so {@link SECTIONS}
 * carries a `category` per entry and {@link EditorInspectorSections}
 * filters by it. There is exactly one section list — a tab cannot
 * silently gain or lose a section, and adding a section is still one
 * entry in one array. `EditorInspectorPanel` (the un-tabbed block, kept
 * for hosts/tests that mount the body directly) renders every category
 * in the same canonical order the appended block always used.
 */

import type { ReactNode } from "react";
import { InspectorSection } from "@/overrides/layout/InspectorSection";
import { useMsg } from "@/state/editor-i18n-context";
import { BindingsSection } from "../bindings/BindingsSection.js";
import { ComponentInstanceSection } from "../components/ComponentInstanceSection.js";
import { InteractionsSection } from "../interactions/InteractionsSection.js";
import { ImageSection } from "./sections/image/ImageSection.js";
import { LayoutSection } from "./sections/layout/LayoutSection.js";
import { StyleSection } from "./sections/style/StyleSection.js";
import { TypographySection } from "./sections/typography/TypographySection.js";
import type {
	InspectorSectionCategory,
	InspectorSectionDefinition,
} from "./sections-registry.js";
import {
	type EditorInspectorContext,
	useEditorInspector,
} from "./use-inspector.js";

/**
 * The §11.2 sections shipped so far, in canonical order. Static list
 * (no mutable registry): CORE-P1A-006/-007 own the entries; later
 * phases append additively.
 */
export const SECTIONS: readonly InspectorSectionDefinition[] = [
	{
		id: "layout",
		titleKey: "studio.editor.inspector.section.layout",
		category: "style",
		family: "layout",
		Component: LayoutSection,
	},
	{
		id: "style",
		titleKey: "studio.editor.inspector.section.style",
		category: "style",
		family: "style",
		Component: StyleSection,
	},
	{
		id: "typography",
		titleKey: "studio.editor.inspector.section.typography",
		category: "style",
		family: "typography",
		Component: TypographySection,
	},
	{
		id: "image",
		titleKey: "studio.editor.inspector.section.image",
		category: "style",
		// Image editing follows declared targets, not a style family
		// (CORE-P1B-010).
		visible: (context) => {
			const primary = context.selection.primaryId;
			if (primary === undefined) {
				return false;
			}
			const metadata = context.bridge.capabilities?.forNode(primary);
			return (metadata?.images?.length ?? 0) > 0;
		},
		Component: ImageSection,
	},
	{
		id: "interactions",
		titleKey: "studio.editor.inspector.section.interactions",
		category: "animation",
		// Gated on the component's own `interactions` capability, not on
		// "something is selected". Any node *could* host an interaction,
		// but ED-INSPECT-002 requires a component that never opted into
		// the editor to render zero editor UI — and a legacy component
		// has no metadata at all, so this correctly hides for it.
		visible: (context) => {
			const primary = context.selection.primaryId;
			if (primary === undefined) {
				return false;
			}
			return (
				context.bridge.capabilities?.forNode(primary)?.interactions === true
			);
		},
		Component: InteractionsSection,
	},
	{
		id: "component",
		titleKey: "studio.editor.inspector.section.component",
		// An instance's variants and overrides ARE its properties, so the
		// section rides with the native field tree rather than opening a
		// fifth tab.
		category: "properties",
		// Gated on the node BEING an instance, not on a declared
		// capability: an instance is an editor construct, so a legacy
		// component can never be one and ED-INSPECT-002 holds trivially.
		visible: (context) => {
			const primary = context.selection.primaryId;
			if (primary === undefined) {
				return false;
			}
			return context.authoring.nodes[primary]?.componentInstance !== undefined;
		},
		Component: ComponentInstanceSection,
	},
	{
		id: "bindings",
		titleKey: "studio.editor.inspector.section.bindings",
		category: "data",
		// Same rule as interactions: gated on the component's declared
		// `bindings` capability, so a legacy component renders zero
		// editor UI (ED-INSPECT-002). The section additionally returns
		// null when no data-source adapter is configured.
		visible: (context) => {
			const primary = context.selection.primaryId;
			if (primary === undefined) {
				return false;
			}
			return (
				context.bridge.capabilities?.forNode(primary)?.bindings ===
				true
			);
		},
		Component: BindingsSection,
	},
];

/** Whether `section` should render for the current selection. */
function isVisible(
	section: InspectorSectionDefinition,
	context: EditorInspectorContext,
): boolean {
	return section.visible !== undefined
		? section.visible(context)
		: section.family !== undefined &&
				context.capableNodeIds(section.family).length > 0;
}

/**
 * The sections of one category that the current selection supports.
 * Exported so the tab shell can ask "is this tab empty?" without
 * rendering it (a tab with nothing to show gets a localized empty
 * state instead of disappearing).
 */
export function visibleSections(
	context: EditorInspectorContext,
	category?: InspectorSectionCategory,
): readonly InspectorSectionDefinition[] {
	return SECTIONS.filter(
		(section) =>
			(category === undefined || section.category === category) &&
			isVisible(section, context),
	);
}

export interface EditorInspectorSectionsProps {
	readonly context: EditorInspectorContext;
	/** Render only this tab's sections; omit for every category. */
	readonly category?: InspectorSectionCategory;
}

/** The universal sections of one category, as collapsible groups. */
export function EditorInspectorSections({
	context,
	category,
}: EditorInspectorSectionsProps): ReactNode {
	const msg = useMsg();
	const visible = visibleSections(context, category);
	if (visible.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-col" data-testid="ak-editor-inspector-sections">
			{visible.map((section) => (
				<InspectorSection
					key={section.id}
					id={`editor:${section.id}`}
					title={msg(section.titleKey)}
					defaultExpanded
					className="border-b border-[var(--ak-studio-border)] last:border-b-0"
				>
					<div className="flex flex-col gap-2 pt-0.5 pb-3">
						<section.Component context={context} />
					</div>
				</InspectorSection>
			))}
		</div>
	);
}

/**
 * The whole universal-sections block, every category at once. Retained
 * for the un-tabbed path (a host that mounts the body directly, and
 * the section-visibility unit tests); the tabbed inspector renders
 * {@link EditorInspectorSections} one category at a time instead.
 */
export default function EditorInspectorPanel(): ReactNode {
	const context = useEditorInspector();
	if (context === null) {
		return null;
	}
	if (visibleSections(context).length === 0) {
		return null;
	}
	return (
		<div className="flex flex-col gap-3" data-testid="ak-editor-inspector">
			<EditorInspectorSections context={context} />
		</div>
	);
}
