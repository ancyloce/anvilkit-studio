/**
 * @file Layout, visual style, and typography specifications
 * (DD-0019 §9.2, verbatim shapes).
 *
 * Specs are partial by design: only authored properties are present,
 * merging is property-wise across precedence layers (§11.3), and no
 * property ever stores `null` (write-time `null` means removal —
 * contract freeze CORE-P0-001 D-8).
 */

import type {
	BorderSpec,
	CssAlignment,
	CssBlendMode,
	CssBoxEdges,
	CssColor,
	CssCorners,
	CssCursor,
	CssJustification,
	CssLength,
	FilterSpec,
	GridTrackList,
	Paint,
	ShadowSpec,
	SizeValue,
	TokenOrLiteral,
} from "./values.js";

/** Universal layout specification (DD-0019 §9.2). */
export interface LayoutSpec {
	readonly display?: "block" | "flex" | "grid" | "none";
	readonly direction?: "row" | "column";
	readonly wrap?: "nowrap" | "wrap";
	readonly alignItems?: CssAlignment;
	readonly justifyContent?: CssJustification;
	readonly gap?: CssLength;
	readonly rowGap?: CssLength;
	readonly columnGap?: CssLength;
	readonly columns?: GridTrackList;
	readonly rows?: GridTrackList;
	readonly padding?: CssBoxEdges;
	readonly margin?: CssBoxEdges;
	readonly width?: SizeValue;
	readonly height?: SizeValue;
	readonly minWidth?: CssLength;
	readonly maxWidth?: CssLength;
	readonly minHeight?: CssLength;
	readonly maxHeight?: CssLength;
	readonly position?: "static" | "relative" | "absolute" | "sticky";
	readonly inset?: CssBoxEdges;
	readonly overflow?: "visible" | "hidden" | "auto" | "scroll";
	readonly zIndex?: number;
}

/** Universal visual style specification (DD-0019 §9.2). */
export interface VisualStyleSpec {
	readonly background?: Paint;
	readonly border?: BorderSpec;
	readonly radius?: CssCorners;
	readonly opacity?: number;
	readonly shadows?: readonly ShadowSpec[];
	readonly filter?: FilterSpec;
	readonly blendMode?: CssBlendMode;
	readonly cursor?: CssCursor;
}

/** Universal typography specification (DD-0019 §9.2). */
export interface TypographySpec {
	readonly fontFamily?: TokenOrLiteral<string>;
	readonly fontSize?: TokenOrLiteral<CssLength>;
	readonly fontWeight?: TokenOrLiteral<number>;
	readonly lineHeight?: TokenOrLiteral<number | CssLength>;
	readonly letterSpacing?: TokenOrLiteral<CssLength>;
	readonly color?: TokenOrLiteral<CssColor>;
	readonly textAlign?: "left" | "center" | "right" | "justify";
	readonly textDecoration?: "none" | "underline" | "line-through";
	readonly textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
	readonly textWrap?: "wrap" | "nowrap" | "balance" | "pretty";
}
