"use client";

/**
 * @file Universal inspector section contract (PLAN-0020
 * CORE-P1A-005; DD-0019 §11.2).
 *
 * Internal (deliberately not snapshot-gated): §11.2's information
 * architecture is capability-driven, and sections land phase by phase
 * — layout, visual style, and typography ship with CORE-P1A-006/-007;
 * tokens/styles (Phase 2), interactions/bindings (Phase 3), and the
 * accessibility integration slot in additively. The concrete section
 * list is a static array owned by `EditorInspectorPanel` (no mutable
 * registry — deterministic order, no import-order coupling). A
 * section is visible exactly when at least one selected node's
 * component declares the section's family capability; legacy
 * components (no `metadata.editor`) surface no universal sections at
 * all (ED-INSPECT-002 coexistence rule).
 *
 * ### Tab categories
 *
 * Each definition also declares the inspector tab it belongs to. The
 * tabbed inspector renders one category at a time, so the category is
 * a property of the section list (one place, deterministic) rather
 * than a second list per tab — adding a section still means adding one
 * entry, and it lands in exactly one tab.
 */

import type { ComponentType } from "react";
import type { InspectorFamily } from "./field-state.js";
import type { EditorInspectorContext } from "./use-inspector.js";

/** Props every section component receives. */
export interface InspectorSectionProps {
	readonly context: EditorInspectorContext;
}

/**
 * Which inspector tab hosts a section. `properties` shares its tab
 * with the native Puck field tree, which `FieldsPanel` owns — an
 * editor-only section categorised `properties` composes *after* those
 * fields, exactly as the whole block used to (ED-INSPECT-002).
 */
export type InspectorSectionCategory =
	| "style"
	| "properties"
	| "data"
	| "animation";

/** One universal section entry in the panel's static list. */
export interface InspectorSectionDefinition {
	readonly id: string;
	/** `studio.editor.inspector.section.*` catalog key. */
	readonly titleKey: string;
	/** The inspector tab this section renders under. */
	readonly category: InspectorSectionCategory;
	/** The capability family gating visibility (family sections). */
	readonly family?: InspectorFamily;
	/** Custom visibility gate (non-family sections, e.g. image). */
	readonly visible?: (context: EditorInspectorContext) => boolean;
	readonly Component: ComponentType<InspectorSectionProps>;
}
