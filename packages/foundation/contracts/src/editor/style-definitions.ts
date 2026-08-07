/**
 * @file Reusable style definitions (DD-0019 §9.4, ED-STYLEDEF-001/002).
 *
 * Ordered multi-attach, no inheritance graph: a node references style
 * definitions in list order (`NodeAuthoringStateV1.styleRefs`), and
 * precedence is resolved property-wise per §11.3.
 */

import type { ResponsiveValue } from "./responsive.js";
import type { LayoutSpec, TypographySpec, VisualStyleSpec } from "./specs.js";

/** Style definition identifier. */
export type StyleDefinitionId = string;

/**
 * What happens to a definition's contribution when it is deleted
 * (ED-STYLEDEF-001; DD-0019 §15.1 "deletion materializes resolved
 * values by default to preserve appearance").
 *
 * `"materialize"` writes the definition's effective contribution into
 * each referencing node's own layer, so nothing changes visually;
 * `"discard"` drops it and lets the node fall back.
 */
export type StyleDefinitionDeletionDisposition =
	| { readonly kind: "materialize" }
	| { readonly kind: "discard" };

/** A reusable, document-local style definition (DD-0019 §9.4). */
export interface StyleDefinition {
	readonly version: "1";
	readonly id: StyleDefinitionId;
	readonly name: string;
	readonly appliesTo: "any" | "container" | "text" | "image";
	readonly layout?: ResponsiveValue<LayoutSpec>;
	readonly style?: ResponsiveValue<VisualStyleSpec>;
	readonly typography?: ResponsiveValue<TypographySpec>;
	readonly createdAt: string;
	readonly updatedAt: string;
}
