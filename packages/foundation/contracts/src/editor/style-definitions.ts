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

/** A reusable, document-local style definition (DD-0019 §9.4). */
export interface StyleDefinitionV1 {
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
