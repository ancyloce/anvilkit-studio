"use client";

/**
 * @file `EditorInspectorPanel` — the universal layout/style/typography
 * inspector body (PLAN-0020 CORE-P1A-005; DD-0019 §11.2;
 * ED-INSPECT-001/002).
 *
 * Lazily loaded through `EditorInspectorMount` (the §28 lazy rule: no
 * inspector bytes in the chrome chunk until the editor feature is
 * actually used). Composes **after** the native Puck fields inside
 * `FieldsPanel` — universal sections never replace or reorder
 * component fields (ED-INSPECT-002). Sections are capability-driven:
 * each renders only when at least one selected node's component
 * declares the matching capability, so legacy configs render zero
 * editor UI here.
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
import type { InspectorSectionDefinition } from "./sections-registry.js";
import { useEditorInspector } from "./use-inspector.js";

/**
 * The §11.2 sections shipped so far, in canonical order. Static list
 * (no mutable registry): CORE-P1A-006/-007 own the entries; later
 * phases append additively.
 */
const SECTIONS: readonly InspectorSectionDefinition[] = [
	{
		id: "layout",
		titleKey: "studio.editor.inspector.section.layout",
		family: "layout",
		Component: LayoutSection,
	},
	{
		id: "style",
		titleKey: "studio.editor.inspector.section.style",
		family: "style",
		Component: StyleSection,
	},
	{
		id: "typography",
		titleKey: "studio.editor.inspector.section.typography",
		family: "typography",
		Component: TypographySection,
	},
	{
		id: "image",
		titleKey: "studio.editor.inspector.section.image",
		// Image editing follows declared targets, not a style family
		// (CORE-P1B-010).
		visible: (context) => {
			const primary = context.selection.primaryId;
			if (primary === undefined) {
				return false;
			}
			const metadata = context.bridge.capabilities?.forNode(primary);
			return (metadata?.capabilities.imageAdjust?.length ?? 0) > 0;
		},
		Component: ImageSection,
	},
	{
		id: "interactions",
		titleKey: "studio.editor.inspector.section.interactions",
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
				context.bridge.capabilities?.forNode(primary)?.capabilities
					.interactions === true
			);
		},
		Component: InteractionsSection,
	},
	{
		id: "component",
		titleKey: "studio.editor.inspector.section.component",
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
				context.bridge.capabilities?.forNode(primary)?.capabilities.bindings ===
				true
			);
		},
		Component: BindingsSection,
	},
];

/** The universal-sections block appended below native Puck fields. */
export default function EditorInspectorPanel(): ReactNode {
	const msg = useMsg();
	const context = useEditorInspector();
	if (context === null) {
		return null;
	}
	const visible = SECTIONS.filter((section) =>
		section.visible !== undefined
			? section.visible(context)
			: section.family !== undefined &&
				context.capableNodeIds(section.family).length > 0,
	);
	if (visible.length === 0) {
		return null;
	}
	return (
		<div className="flex flex-col gap-3" data-testid="ak-editor-inspector">
			{visible.map((section) => (
				<InspectorSection
					key={section.id}
					id={`editor:${section.id}`}
					title={msg(section.titleKey)}
					defaultExpanded
				>
					<div className="flex flex-col gap-3 pt-1 pb-2">
						<section.Component context={context} />
					</div>
				</InspectorSection>
			))}
		</div>
	);
}
