/**
 * @file Typed CSS value primitives for the editor contract surface
 * (DD-0019 §9.3, §11.5).
 *
 * Every value is a **typed object, never arbitrary CSS text**: raw
 * declarations, selectors, `url()`, semicolons, braces, and
 * `expression()` are unrepresentable by construction. Final CSS is
 * produced exclusively by the allowlisted serializer in
 * `@anvilkit/core/editor` (`resolveAuthoringStyle`, CORE-P0-018).
 */

/**
 * A JSON-serializable value. The persistence baseline for everything
 * that enters the authoring sidecar: props, overrides, fallbacks.
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

/**
 * A structural property path: object keys and array indices, matching
 * the `EditorError.path` and `ComponentPropDefinition.sourcePath`
 * conventions. Never a string-encoded dot/bracket path.
 * (Contract freeze CORE-P0-001 §1.2.)
 */
export type PropertyPath = readonly (string | number)[];

/**
 * Recursive command patch. A property set to `null` means "remove this
 * property at the addressed layer" (DD-0019 §9.1 `null` semantics
 * applied property-wise). `null` is a **write-time signal only**:
 * reducers translate it into key removal; persisted spec objects never
 * store nulls. (Contract freeze CORE-P0-001 D-8.)
 */
export type EditorPatch<T> = {
	readonly [K in keyof T]?: T[K] extends object
		? EditorPatch<T[K]> | T[K] | null
		: T[K] | null;
};

/** Length units accepted by the typed CSS schema (DD-0019 §9.3). */
export type CssUnit =
	| "px"
	| "rem"
	| "em"
	| "%"
	| "vw"
	| "vh"
	| "dvw"
	| "dvh"
	| "fr";

/**
 * AST-built math expression for `calc`/`min`/`max`/`clamp` values.
 * Only numeric-unit leaves, token references, binary operators, and
 * the three comparison functions exist — there is no raw-text member,
 * so unsafe CSS cannot be smuggled through a math expression.
 */
export type CssMathExpression =
	| { readonly kind: "unit"; readonly value: number; readonly unit: CssUnit }
	| { readonly kind: "number"; readonly value: number }
	| { readonly kind: "token"; readonly tokenId: string }
	| {
			readonly kind: "op";
			readonly operator: "+" | "-" | "*" | "/";
			readonly left: CssMathExpression;
			readonly right: CssMathExpression;
	  }
	| {
			readonly kind: "fn";
			readonly fn: "min" | "max" | "clamp";
			readonly args: readonly CssMathExpression[];
	  };

/**
 * A typed CSS length: number-plus-unit, a safe keyword, a token
 * reference, or an AST-built math expression (DD-0019 §9.3).
 */
export type CssLength =
	| { readonly kind: "unit"; readonly value: number; readonly unit: CssUnit }
	| {
			readonly kind: "keyword";
			readonly keyword: "auto" | "min-content" | "max-content" | "fit-content";
	  }
	| { readonly kind: "token"; readonly tokenId: string }
	| { readonly kind: "math"; readonly expression: CssMathExpression };

/**
 * Width/height value. Alias of {@link CssLength}: sizing keywords
 * (`auto`, `min-content`, …) are carried by the keyword member.
 */
export type SizeValue = CssLength;

/** A single grid track (P0 set: fixed, fr, auto — DD-0019 §11.5). */
export type GridTrack =
	| { readonly kind: "fixed"; readonly length: CssLength }
	| { readonly kind: "fr"; readonly value: number }
	| { readonly kind: "auto" };

/** Ordered grid track list for `columns` / `rows`. */
export type GridTrackList = readonly GridTrack[];

/** Per-edge box values (margin, padding, inset). All edges optional. */
export interface CssBoxEdges {
	readonly top?: CssLength;
	readonly right?: CssLength;
	readonly bottom?: CssLength;
	readonly left?: CssLength;
}

/** Per-corner radius values. Linked radii set all four corners. */
export interface CssCorners {
	readonly topLeft?: CssLength;
	readonly topRight?: CssLength;
	readonly bottomRight?: CssLength;
	readonly bottomLeft?: CssLength;
}

/** A typed color value. Token indirection wraps via {@link TokenOrLiteral}. */
export type CssColor =
	| { readonly kind: "hex"; readonly value: string }
	| {
			readonly kind: "rgba";
			readonly r: number;
			readonly g: number;
			readonly b: number;
			readonly a: number;
	  }
	| {
			readonly kind: "hsla";
			readonly h: number;
			readonly s: number;
			readonly l: number;
			readonly a: number;
	  }
	| {
			readonly kind: "keyword";
			readonly keyword: "transparent" | "currentColor";
	  };

/**
 * A literal value or a reference to a document design token. Mirrors
 * the `TokenValue` literal/alias naming (DD-0019 §9.4); resolution is
 * performed by `resolveToken` (§24.5) after precedence selection.
 */
export type TokenOrLiteral<T> =
	| { readonly kind: "literal"; readonly value: T }
	| { readonly kind: "token"; readonly tokenId: string };

/** Gradient color stop; `offset` is normalized 0–1. */
export interface GradientStop {
	readonly color: TokenOrLiteral<CssColor>;
	readonly offset: number;
}

/**
 * Fill paint (P0 set: solid, linear gradient, image — DD-0019 §11.5).
 * Image `src` accepts host asset references as well as URLs; raw-URL
 * acceptance is policy-gated (`EditorPolicies.allowRawUrls`), enforced
 * at schema-validation time, not encoded in the type.
 */
export type Paint =
	| { readonly kind: "none" }
	| { readonly kind: "solid"; readonly color: TokenOrLiteral<CssColor> }
	| {
			readonly kind: "linear-gradient";
			/** Gradient angle in degrees. */
			readonly angle: number;
			readonly stops: readonly GradientStop[];
	  }
	| {
			readonly kind: "image";
			readonly src: string;
			readonly fit?: "cover" | "contain" | "fill" | "none" | "scale-down";
			/** Normalized 0–1 focal position. */
			readonly position?: { readonly x: number; readonly y: number };
	  };

/** One border edge: style, width, color — each independently optional. */
export interface BorderEdge {
	readonly style?: "none" | "solid" | "dashed" | "dotted";
	readonly width?: CssLength;
	readonly color?: TokenOrLiteral<CssColor>;
}

/** Per-edge border specification (DD-0019 §11.5). */
export interface BorderSpec {
	readonly top?: BorderEdge;
	readonly right?: BorderEdge;
	readonly bottom?: BorderEdge;
	readonly left?: BorderEdge;
}

/** One shadow layer; multi-layer shadows are ordered arrays. */
export interface ShadowSpec {
	readonly kind: "drop" | "inner";
	readonly offsetX: CssLength;
	readonly offsetY: CssLength;
	readonly blur: CssLength;
	readonly spread?: CssLength;
	readonly color: TokenOrLiteral<CssColor>;
}

/**
 * Basic filter set (P0 — DD-0019 §11.5). Ratio values are normalized
 * numbers where `1` is identity; `grayscale` is 0–1.
 */
export interface FilterSpec {
	readonly blur?: CssLength;
	readonly brightness?: number;
	readonly contrast?: number;
	readonly saturate?: number;
	readonly grayscale?: number;
}

/** Standard CSS blend modes. */
export type CssBlendMode =
	| "normal"
	| "multiply"
	| "screen"
	| "overlay"
	| "darken"
	| "lighten"
	| "color-dodge"
	| "color-burn"
	| "hard-light"
	| "soft-light"
	| "difference"
	| "exclusion"
	| "hue"
	| "saturation"
	| "color"
	| "luminosity";

/** Cursor values exposed by the visual style inspector. */
export type CssCursor =
	| "auto"
	| "default"
	| "pointer"
	| "text"
	| "move"
	| "grab"
	| "grabbing"
	| "not-allowed";

/** Cross-axis alignment values shared by flex and grid controls. */
export type CssAlignment = "start" | "center" | "end" | "stretch" | "baseline";

/** Main-axis justification values shared by flex and grid controls. */
export type CssJustification =
	| "start"
	| "center"
	| "end"
	| "space-between"
	| "space-around"
	| "space-evenly"
	| "stretch";

/** Cubic-bezier easing as `[x1, y1, x2, y2]`. */
export type CubicBezier = readonly [number, number, number, number];
