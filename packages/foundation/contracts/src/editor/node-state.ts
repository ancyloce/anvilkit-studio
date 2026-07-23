/**
 * @file Per-node authoring state and inline-content contracts
 * (DD-0019 §9.2, §17).
 */

import type { BindingId } from "./bindings.js";
import type { ComponentInstanceState } from "./components.js";
import type { InteractionId } from "./interactions.js";
import type { ResponsiveValue } from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";
import type { StyleDefinitionId } from "./style-definitions.js";

/**
 * Explicit accessibility overrides authored on a node (referenced by
 * DD-0019 §9.2; consumed by the §20 diagnostics engine). `label` set
 * to an empty string marks decorative content.
 */
export interface AccessibilityOverride {
	readonly role?: string;
	readonly label?: string;
	readonly description?: string;
	readonly hidden?: boolean;
}

/**
 * The authoring record for one Puck node (DD-0019 §9.2, verbatim).
 * Records exist only when non-default authoring state exists
 * (invariant 3, §7.2); node IDs act as stable indices.
 *
 * `hidden` is responsive editor metadata compiled to `display:none`;
 * it never overwrites `layout.display` (§18).
 */
export interface NodeAuthoringStateV1 {
	readonly version: "1";
	readonly name?: string;
	readonly hidden?: ResponsiveValue<boolean>;
	readonly locked?: boolean;
	readonly layout?: ResponsiveValue<LayoutSpec>;
	readonly style?: ResponsiveValue<VisualStyleSpec>;
	readonly typography?: ResponsiveValue<TypographySpec>;
	readonly styleRefs?: ResponsiveValue<readonly StyleDefinitionId[]>;
	readonly interactionRefs?: readonly InteractionId[];
	readonly bindingRefs?: readonly BindingId[];
	readonly componentInstance?: ComponentInstanceState;
	readonly accessibility?: AccessibilityOverride;
}

/**
 * A Tiptap block node in the shared rich-text contract. Allowed nodes
 * (paragraphs, headings 1–6, lists, list items, blockquotes, text,
 * hard breaks) and marks (bold, italic, underline, strike, code, safe
 * links) are enforced by the shared sanitization pipeline — raw HTML
 * and inline-style marks are rejected (DD-0019 §17).
 */
export interface TiptapBlockNode {
	readonly type: string;
	readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
	readonly content?: readonly TiptapBlockNode[];
	readonly marks?: ReadonlyArray<{
		readonly type: string;
		readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
	}>;
	readonly text?: string;
}

/**
 * The stable versioned Tiptap JSON contract (ED-TEXT-002) shared by
 * the `RichTextField` field type and canvas inline editing — one
 * schema and sanitizer for both surfaces so they cannot drift.
 */
export interface TiptapDocumentV1 {
	readonly version: "1";
	readonly type: "doc";
	readonly content: readonly TiptapBlockNode[];
}

/** An inline-editable text value (DD-0019 §17, verbatim). */
export type InlineTextValue =
	| { readonly format: "plain"; readonly value: string }
	| { readonly format: "tiptap"; readonly value: TiptapDocumentV1 };

/**
 * Image adjustment state (DD-0019 §17, verbatim). Crop uses
 * normalized source-image coordinates; focal `position` is normalized
 * 0–1. Decorative mode writes empty alt text.
 */
export interface ImageAdjustment {
	readonly fit: "cover" | "contain" | "fill" | "none" | "scale-down";
	readonly position: { readonly x: number; readonly y: number };
	readonly crop?: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	};
	readonly rotation?: 0 | 90 | 180 | 270;
}
