/**
 * @file Typed CSS value schemas with the §9.3 allowlist
 * (PLAN-0020 CORE-P0-005B; DD-0019 §9.3).
 *
 * Values are typed objects, never text: raw declarations, selectors,
 * `url()`, semicolons, braces, and `expression()` are structurally
 * unrepresentable — the only free-form strings in this module are
 * hex color digits and token ids, both shape-validated. Math
 * expressions are AST-built with bounded depth.
 */

import type {
	CssColor,
	CssLength,
	CssMathExpression,
	GridTrack,
	TokenOrLiteral,
} from "@anvilkit/contracts/editor";
import { z } from "zod";
import {
	FiniteNumberSchema,
	IdSchema,
	UnitIntervalSchema,
} from "./primitives.js";

/** Length units accepted by the typed CSS schema (DD-0019 §9.3). */
export const CssUnitSchema = z.enum([
	"px",
	"rem",
	"em",
	"%",
	"vw",
	"vh",
	"dvw",
	"dvh",
	"fr",
]);

/** Maximum math-expression AST depth accepted at parse time. */
export const CSS_MATH_MAX_DEPTH = 16;

const CssMathExpressionBareSchema: z.ZodType<CssMathExpression> = z.lazy(() =>
	z.discriminatedUnion("kind", [
		z.looseObject({
			kind: z.literal("unit"),
			value: FiniteNumberSchema,
			unit: CssUnitSchema,
		}),
		z.looseObject({ kind: z.literal("number"), value: FiniteNumberSchema }),
		z.looseObject({ kind: z.literal("token"), tokenId: IdSchema }),
		z.looseObject({
			kind: z.literal("op"),
			operator: z.enum(["+", "-", "*", "/"]),
			left: CssMathExpressionBareSchema,
			right: CssMathExpressionBareSchema,
		}),
		z.looseObject({
			kind: z.literal("fn"),
			fn: z.enum(["min", "max", "clamp"]),
			args: z.array(CssMathExpressionBareSchema).min(1).max(3),
		}),
	]),
);

function mathDepth(expression: CssMathExpression): number {
	switch (expression.kind) {
		case "op":
			return (
				1 + Math.max(mathDepth(expression.left), mathDepth(expression.right))
			);
		case "fn":
			return 1 + Math.max(...expression.args.map(mathDepth), 0);
		default:
			return 1;
	}
}

/** AST-built `calc`/`min`/`max`/`clamp` expression, depth-bounded. */
export const CssMathExpressionSchema: z.ZodType<CssMathExpression> =
	CssMathExpressionBareSchema.refine(
		(expression) => mathDepth(expression) <= CSS_MATH_MAX_DEPTH,
		{ message: `math expression depth must be <= ${CSS_MATH_MAX_DEPTH}` },
	);

/** A typed CSS length (DD-0019 §9.3 allowlist). */
export const CssLengthSchema: z.ZodType<CssLength> = z.discriminatedUnion(
	"kind",
	[
		z.looseObject({
			kind: z.literal("unit"),
			value: FiniteNumberSchema,
			unit: CssUnitSchema,
		}),
		z.looseObject({
			kind: z.literal("keyword"),
			keyword: z.enum(["auto", "min-content", "max-content", "fit-content"]),
		}),
		z.looseObject({ kind: z.literal("token"), tokenId: IdSchema }),
		z.looseObject({
			kind: z.literal("math"),
			expression: CssMathExpressionSchema,
		}),
	],
);

/** Width/height value — alias of {@link CssLengthSchema}. */
export const SizeValueSchema = CssLengthSchema;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A typed color value. */
export const CssColorSchema: z.ZodType<CssColor> = z.discriminatedUnion(
	"kind",
	[
		z.looseObject({
			kind: z.literal("hex"),
			value: z.string().regex(HEX_COLOR, {
				message: "must be a #rgb/#rgba/#rrggbb/#rrggbbaa hex color",
			}),
		}),
		z.looseObject({
			kind: z.literal("rgba"),
			r: FiniteNumberSchema.refine((v) => v >= 0 && v <= 255),
			g: FiniteNumberSchema.refine((v) => v >= 0 && v <= 255),
			b: FiniteNumberSchema.refine((v) => v >= 0 && v <= 255),
			a: UnitIntervalSchema,
		}),
		z.looseObject({
			kind: z.literal("hsla"),
			h: FiniteNumberSchema,
			s: UnitIntervalSchema,
			l: UnitIntervalSchema,
			a: UnitIntervalSchema,
		}),
		z.looseObject({
			kind: z.literal("keyword"),
			keyword: z.enum(["transparent", "currentColor"]),
		}),
	],
);

/**
 * Build a `TokenOrLiteral<T>` schema around a literal value schema.
 */
export function tokenOrLiteralSchema<T extends z.ZodType>(
	literal: T,
): z.ZodType<TokenOrLiteral<z.output<T>>> {
	return z.discriminatedUnion("kind", [
		z.looseObject({ kind: z.literal("literal"), value: literal }),
		z.looseObject({ kind: z.literal("token"), tokenId: IdSchema }),
	]) as unknown as z.ZodType<TokenOrLiteral<z.output<T>>>;
}

/** One grid track (P0 set: fixed, fr, auto). */
export const GridTrackSchema: z.ZodType<GridTrack> = z.discriminatedUnion(
	"kind",
	[
		z.looseObject({ kind: z.literal("fixed"), length: CssLengthSchema }),
		z.looseObject({
			kind: z.literal("fr"),
			value: FiniteNumberSchema.refine((v) => v > 0),
		}),
		z.looseObject({ kind: z.literal("auto") }),
	],
);

/** Ordered grid track list. */
export const GridTrackListSchema = z.array(GridTrackSchema);

/** Per-edge box values. */
export const CssBoxEdgesSchema = z.looseObject({
	top: CssLengthSchema.optional(),
	right: CssLengthSchema.optional(),
	bottom: CssLengthSchema.optional(),
	left: CssLengthSchema.optional(),
});

/** Per-corner radius values. */
export const CssCornersSchema = z.looseObject({
	topLeft: CssLengthSchema.optional(),
	topRight: CssLengthSchema.optional(),
	bottomRight: CssLengthSchema.optional(),
	bottomLeft: CssLengthSchema.optional(),
});
